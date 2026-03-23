import { TriggerTypes } from "deno-slack-api/mod.ts";
import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { t } from "../../lib/i18n/mod.ts";
import {
  type SlackApiClient,
  uploadSlackFileToChannel,
} from "../../lib/slack/file_upload.ts";
import {
  buildMotionCaptureJobKey,
  buildSoraCamSnapshotFileName,
  buildSoraCamSnapshotTitle,
  createSoracomClientFromEnv,
  deleteMotionCaptureJob,
  downloadSoraCamSnapshot,
  getMotionCaptureJob,
  upsertMotionCaptureJob,
  waitForSoraCamImageExport,
} from "../../lib/soracom/mod.ts";
import type {
  SoraCamEvent,
  SoracomClient,
  SoracomMotionCaptureJob,
} from "../../lib/soracom/mod.ts";
import { soraCamDeviceIdSchema } from "../../lib/validation/schemas.ts";

/**
 * ソラカメ動体検知→画像キャプチャ複合関数定義
 *
 * 指定デバイスのモーションイベントを取得し、スレッドへ分割アップロードします。
 */
export const SoracomSoraCamMotionCaptureFunctionDefinition = DefineFunction({
  callback_id: "soracom_soracam_motion_capture",
  title: "SoraCam動体検知画像確認",
  description: "動体検知イベントを見つけ、録画から画像を切り出します",
  source_file: "functions/soracom_soracam_motion_capture/mod.ts",
  input_parameters: {
    properties: {
      device_id: {
        type: Schema.types.string,
        description: "SoraCam デバイス ID",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "結果を投稿するチャンネル",
      },
    },
    required: ["device_id", "channel_id"],
  },
  output_parameters: {
    properties: {
      device_id: {
        type: Schema.types.string,
        description: "デバイス ID",
      },
      event_count: {
        type: Schema.types.number,
        description: "検出した動体イベント数",
      },
      exported_images: {
        type: Schema.types.number,
        description: "累計アップロード済み画像数",
      },
      message: {
        type: Schema.types.string,
        description: "結果メッセージ",
      },
    },
    required: ["device_id", "event_count", "exported_images", "message"],
  },
});

interface MotionCaptureDatastoreClient {
  apps: {
    datastore: {
      get: (params: {
        datastore: string;
        id: string;
      }) => Promise<{
        ok: boolean;
        item?: Record<string, unknown>;
        error?: string;
      }>;
      put: (params: {
        datastore: string;
        item: Record<string, unknown>;
      }) => Promise<{ ok: boolean; error?: string }>;
      delete: (params: {
        datastore: string;
        id: string;
      }) => Promise<{ ok: boolean; error?: string }>;
    };
  };
}

interface MotionCaptureChatClient {
  chat: {
    postMessage: (params: {
      channel: string;
      text: string;
    }) => Promise<{
      ok: boolean;
      error?: string;
      ts?: string;
      message?: { ts?: string };
    }>;
    update: (params: {
      channel: string;
      ts: string;
      text: string;
    }) => Promise<{ ok: boolean; error?: string }>;
  };
}

interface MotionCaptureTriggerClient {
  workflows: {
    triggers: {
      create: (params: Record<string, unknown>) => Promise<{
        ok: boolean;
        error?: string;
        trigger?: {
          id?: string;
        };
      }>;
      delete: (params: { trigger_id: string }) => Promise<{
        ok: boolean;
        error?: string;
      }>;
    };
  };
}

type MotionCaptureClient =
  & SlackApiClient
  & MotionCaptureDatastoreClient
  & MotionCaptureChatClient
  & MotionCaptureTriggerClient;

type MotionCaptureUploadResult = {
  status: "uploaded" | "failed";
  imageUrl?: string;
  errorMessage?: string;
};

type MotionCaptureResult = {
  eventCount: number;
  exportedImages: number;
  message: string;
};

type DelayFn = (ms: number) => Promise<void>;

/** エクスポート対象とするイベント種別 */
const MOTION_EVENT_TYPES = ["motion", "person"];
const ALL_MOTION_EVENT_LIMIT = Number.MAX_SAFE_INTEGER;
const LOOKBACK_WINDOW_MS = 60 * 60 * 1000;
export const MOTION_CAPTURE_BATCH_SIZE = 5;
// Deployed custom functions typically allow up to 60 seconds.
// Keep 10 seconds of headroom for progress updates and continuation scheduling.
export const MOTION_CAPTURE_TIME_BUDGET_MS = 50_000;
export const MOTION_CAPTURE_CONTINUATION_DELAY_MS = 60_000;
export const MOTION_CAPTURE_CREATION_SETTLE_MS = 750;
export const MOTION_CAPTURE_CREATION_WAIT_RETRIES = 20;
export const MOTION_CAPTURE_CREATION_WAIT_INTERVAL_MS = 250;
const MOTION_CAPTURE_WORKFLOW_PATH =
  "#/workflows/soracom_soracam_motion_capture_workflow";
const MOTION_CAPTURE_PENDING_THREAD_TS = "__pending__";

/**
 * モーションイベントをフィルタリングします
 *
 * @param events - イベント一覧
 * @returns モーション系イベントのみ
 */
export function filterMotionEvents(events: SoraCamEvent[]): SoraCamEvent[] {
  return events.filter((event) =>
    MOTION_EVENT_TYPES.includes(event.eventType.toLowerCase())
  );
}

/**
 * 次バッチで処理するイベント時刻一覧を返します。
 *
 * @param job - 動体検知ジョブ
 * @param batchSize - バッチサイズ
 * @returns 処理対象イベント時刻一覧
 */
export function selectMotionCaptureBatchEventTimes(
  job: SoracomMotionCaptureJob,
  batchSize = MOTION_CAPTURE_BATCH_SIZE,
): number[] {
  return job.eventTimes.slice(job.nextIndex, job.nextIndex + batchSize);
}

/**
 * 動体検知画像のアップロード開始メッセージを生成します。
 *
 * @param deviceId - デバイスID
 * @param eventCount - モーションイベント数
 * @param batchCount - 今回アップロードする件数
 * @returns フォーマットされたSlackメッセージ
 */
export function formatPendingMotionCaptureMessage(
  deviceId: string,
  eventCount: number,
  batchCount: number,
): string {
  if (eventCount === 0) {
    return t("soracom.messages.soracam_motion_none", { deviceId });
  }

  return t("soracom.messages.soracam_motion_pending", {
    deviceId,
    eventCount,
    batchCount,
  });
}

/**
 * 親メッセージの進捗表示を生成します。
 *
 * @param deviceId - デバイスID
 * @param eventCount - モーションイベント数
 * @param uploadedImageCount - 累計アップロード済み件数
 * @param failedImageCount - 累計失敗件数
 * @param remainingCount - 残件数
 * @returns フォーマット済みメッセージ
 */
export function formatMotionCaptureMessage(
  deviceId: string,
  eventCount: number,
  uploadedImageCount: number,
  failedImageCount: number,
  remainingCount: number,
): string {
  if (eventCount === 0) {
    return t("soracom.messages.soracam_motion_none", { deviceId });
  }

  const lines = [
    `*${
      t("soracom.messages.soracam_motion_header", {
        deviceId,
        eventCount,
        imageCount: uploadedImageCount,
      })
    }*`,
    t("soracom.messages.soracam_motion_progress", {
      uploaded: uploadedImageCount,
      failed: failedImageCount,
      remaining: remainingCount,
    }),
    t("soracom.messages.soracam_motion_thread_notice"),
  ];

  if (remainingCount > 0) {
    lines.push(t("soracom.messages.soracam_motion_resume_notice"));
  } else {
    lines.push(t("soracom.messages.soracam_motion_completed"));
  }

  return lines.join("\n");
}

/**
 * 保存済みジョブに1件分の処理結果を反映します。
 *
 * @param job - 現在のジョブ
 * @param result - 1件分のアップロード結果
 * @param now - 更新時刻
 * @returns 更新後ジョブ
 */
export function advanceMotionCaptureJob(
  job: SoracomMotionCaptureJob,
  result: MotionCaptureUploadResult,
  now = Date.now(),
): SoracomMotionCaptureJob {
  const nextIndex = Math.min(job.nextIndex + 1, job.totalEventCount);
  const uploadedCount = job.uploadedCount +
    (result.status === "uploaded" ? 1 : 0);
  const failedCount = job.failedCount +
    (result.status === "failed" ? 1 : 0);

  return {
    ...job,
    nextIndex,
    uploadedCount,
    failedCount,
    status: nextIndex >= job.totalEventCount ? "completed" : "pending",
    updatedAt: new Date(now).toISOString(),
  };
}

function setMotionCaptureContinuationTrigger(
  job: SoracomMotionCaptureJob,
  continuationTriggerId: string | undefined,
  now = Date.now(),
): SoracomMotionCaptureJob {
  return {
    ...job,
    ...(continuationTriggerId ? { continuationTriggerId } : {}),
    ...(!continuationTriggerId ? { continuationTriggerId: undefined } : {}),
    updatedAt: new Date(now).toISOString(),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createStartingMotionCaptureJob(
  channelId: string,
  deviceId: string,
  claimId: string,
  now: number,
): SoracomMotionCaptureJob {
  const timestamp = new Date(now).toISOString();
  return {
    jobKey: buildMotionCaptureJobKey(channelId, deviceId),
    channelId,
    deviceId,
    threadTs: MOTION_CAPTURE_PENDING_THREAD_TS,
    windowStartMs: 0,
    windowEndMs: 0,
    eventTimes: [],
    nextIndex: 0,
    totalEventCount: 0,
    uploadedCount: 0,
    failedCount: 0,
    claimId,
    status: "starting",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function waitForReadyMotionCaptureJob(
  client: MotionCaptureClient,
  channelId: string,
  deviceId: string,
  delayFn: DelayFn,
): Promise<SoracomMotionCaptureJob | null> {
  for (
    let attempt = 0;
    attempt < MOTION_CAPTURE_CREATION_WAIT_RETRIES;
    attempt++
  ) {
    const job = await getMotionCaptureJob(client, channelId, deviceId);
    if (job === null || job.status !== "starting") {
      return job;
    }
    await delayFn(MOTION_CAPTURE_CREATION_WAIT_INTERVAL_MS);
  }

  return await getMotionCaptureJob(client, channelId, deviceId);
}

async function tryClaimMotionCaptureJobCreation(
  client: MotionCaptureClient,
  channelId: string,
  deviceId: string,
  now: number,
  delayFn: DelayFn,
): Promise<
  { claimed: boolean; job: SoracomMotionCaptureJob | null; claimId: string }
> {
  const claimId = crypto.randomUUID();
  await upsertMotionCaptureJob(
    client,
    createStartingMotionCaptureJob(channelId, deviceId, claimId, now),
  );
  await delayFn(MOTION_CAPTURE_CREATION_SETTLE_MS);

  const job = await getMotionCaptureJob(client, channelId, deviceId);
  return {
    claimed: job?.status === "starting" && job.claimId === claimId,
    job,
    claimId,
  };
}

function getPostedMessageTs(
  response: { ts?: string; message?: { ts?: string } },
): string | null {
  if (typeof response.ts === "string") {
    return response.ts;
  }

  if (typeof response.message?.ts === "string") {
    return response.message.ts;
  }

  return null;
}

async function createMotionCaptureJob(
  client: MotionCaptureClient,
  soracomClient: Pick<SoracomClient, "getSoraCamEvents">,
  deviceId: string,
  channelId: string,
  now: number,
  claimId?: string,
): Promise<SoracomMotionCaptureJob | null> {
  const windowEndMs = now;
  const windowStartMs = now - LOOKBACK_WINDOW_MS;
  const events = await soracomClient.getSoraCamEvents(
    deviceId,
    windowStartMs,
    windowEndMs,
    ALL_MOTION_EVENT_LIMIT,
  );
  const motionEvents = filterMotionEvents(events);

  if (motionEvents.length === 0) {
    return null;
  }

  const batchCount = Math.min(
    motionEvents.length,
    MOTION_CAPTURE_BATCH_SIZE,
  );
  const pendingMessage = formatPendingMotionCaptureMessage(
    deviceId,
    motionEvents.length,
    batchCount,
  );
  const postResponse = await client.chat.postMessage({
    channel: channelId,
    text: pendingMessage,
  });
  if (!postResponse.ok) {
    throw new Error(
      t("errors.api_call_failed", {
        error: postResponse.error ?? "chat.postMessage_failed",
      }),
    );
  }

  const threadTs = getPostedMessageTs(postResponse);
  if (!threadTs) {
    throw new Error(t("errors.data_not_found"));
  }

  const timestamp = new Date(now).toISOString();
  const job: SoracomMotionCaptureJob = {
    jobKey: buildMotionCaptureJobKey(channelId, deviceId),
    channelId,
    deviceId,
    threadTs,
    windowStartMs,
    windowEndMs,
    eventTimes: motionEvents.map((event) => event.eventTime),
    nextIndex: 0,
    totalEventCount: motionEvents.length,
    uploadedCount: 0,
    failedCount: 0,
    ...(claimId ? { claimId } : {}),
    status: "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await upsertMotionCaptureJob(client, job);
  return job;
}

async function uploadMotionCaptureSnapshot(
  soracomClient: Pick<
    SoracomClient,
    "exportSoraCamImage" | "getSoraCamImageExport"
  >,
  client: SlackApiClient,
  channelId: string,
  threadTs: string,
  deviceId: string,
  eventTime: number,
): Promise<MotionCaptureUploadResult> {
  try {
    const requestedExport = await soracomClient.exportSoraCamImage(
      deviceId,
      eventTime,
    );
    const completedExport =
      requestedExport.status === "completed" && requestedExport.url
        ? requestedExport
        : await waitForSoraCamImageExport(
          soracomClient,
          deviceId,
          requestedExport.exportId,
        );

    const snapshotBytes = await downloadSoraCamSnapshot(
      deviceId,
      completedExport.url,
    );

    await uploadSlackFileToChannel(
      client,
      channelId,
      snapshotBytes,
      {
        filename: buildSoraCamSnapshotFileName(deviceId, eventTime),
        title: buildSoraCamSnapshotTitle(deviceId, eventTime),
        contentType: "image/jpeg",
        threadTs,
      },
    );

    return {
      status: "uploaded",
      imageUrl: completedExport.url,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `soracom_soracam_motion_capture upload error (${deviceId} @ ${eventTime}):`,
      errorMessage,
    );
    return {
      status: "failed",
      errorMessage,
    };
  }
}

async function deleteMotionCaptureContinuationTrigger(
  client: MotionCaptureTriggerClient,
  triggerId: string,
): Promise<void> {
  const response = await client.workflows.triggers.delete({
    trigger_id: triggerId,
  });

  if (
    !response.ok && response.error && response.error !== "trigger_not_found"
  ) {
    console.warn(
      "soracom_soracam_motion_capture trigger delete warning:",
      response.error,
    );
  }
}

async function scheduleMotionCaptureContinuation(
  client: MotionCaptureTriggerClient,
  deviceId: string,
  channelId: string,
  now: number,
): Promise<string> {
  const startTime = new Date(now + MOTION_CAPTURE_CONTINUATION_DELAY_MS)
    .toISOString();
  const response = await client.workflows.triggers.create({
    type: TriggerTypes.Scheduled,
    name: t("soracom.messages.soracam_motion_trigger_name", { deviceId }),
    workflow: MOTION_CAPTURE_WORKFLOW_PATH,
    inputs: {
      device_id: { value: deviceId },
      channel_id: { value: channelId },
    },
    schedule: {
      start_time: startTime,
      frequency: {
        type: "once",
      },
    },
  });

  if (!response.ok || !response.trigger?.id) {
    throw new Error(
      t("errors.api_call_failed", {
        error: response.error ?? "workflows.triggers.create_failed",
      }),
    );
  }

  return response.trigger.id;
}

/**
 * 動体検知画像アップロードを1バッチ分処理します。
 *
 * @param params - 実行コンテキスト
 * @returns 実行結果
 */
export async function processMotionCaptureBatch(
  params: {
    client: MotionCaptureClient;
    soracomClient: Pick<
      SoracomClient,
      | "getSoraCamEvents"
      | "exportSoraCamImage"
      | "getSoraCamImageExport"
    >;
    channelId: string;
    deviceId: string;
    now?: number;
    nowFn?: () => number;
    delayFn?: DelayFn;
  },
): Promise<MotionCaptureResult> {
  const nowFn = params.nowFn ?? (() => params.now ?? Date.now());
  const delayFn = params.delayFn ?? sleep;
  const now = params.now ?? nowFn();
  const startedAt = now;
  let job = await getMotionCaptureJob(
    params.client,
    params.channelId,
    params.deviceId,
  );

  if (job?.status === "starting") {
    job = await waitForReadyMotionCaptureJob(
      params.client,
      params.channelId,
      params.deviceId,
      delayFn,
    );
  }

  if (job === null || job.status === "completed") {
    const claimResult = await tryClaimMotionCaptureJobCreation(
      params.client,
      params.channelId,
      params.deviceId,
      now,
      delayFn,
    );

    if (claimResult.claimed) {
      job = await createMotionCaptureJob(
        params.client,
        params.soracomClient,
        params.deviceId,
        params.channelId,
        now,
        claimResult.claimId,
      );
    } else {
      job = await waitForReadyMotionCaptureJob(
        params.client,
        params.channelId,
        params.deviceId,
        delayFn,
      );
    }

    if (job === null) {
      await deleteMotionCaptureJob(
        params.client,
        params.channelId,
        params.deviceId,
      );
      const message = t("soracom.messages.soracam_motion_none", {
        deviceId: params.deviceId,
      });
      const postResponse = await params.client.chat.postMessage({
        channel: params.channelId,
        text: message,
      });
      if (!postResponse.ok) {
        throw new Error(
          t("errors.api_call_failed", {
            error: postResponse.error ?? "chat.postMessage_failed",
          }),
        );
      }

      return {
        eventCount: 0,
        exportedImages: 0,
        message,
      };
    }
  }

  if (job.status === "starting") {
    throw new Error("motion_capture_job_initializing");
  }

  if (job.continuationTriggerId) {
    await deleteMotionCaptureContinuationTrigger(
      params.client,
      job.continuationTriggerId,
    );
    job = setMotionCaptureContinuationTrigger(job, undefined, nowFn());
    await upsertMotionCaptureJob(params.client, job);
  }

  for (const eventTime of selectMotionCaptureBatchEventTimes(job)) {
    if (nowFn() - startedAt >= MOTION_CAPTURE_TIME_BUDGET_MS) {
      break;
    }

    const result = await uploadMotionCaptureSnapshot(
      params.soracomClient,
      params.client,
      params.channelId,
      job.threadTs,
      params.deviceId,
      eventTime,
    );
    job = advanceMotionCaptureJob(job, result);
    await upsertMotionCaptureJob(params.client, job);
  }

  const remainingCount = Math.max(job.totalEventCount - job.nextIndex, 0);
  if (remainingCount > 0) {
    const continuationTriggerId = await scheduleMotionCaptureContinuation(
      params.client,
      params.deviceId,
      params.channelId,
      nowFn(),
    );
    job = setMotionCaptureContinuationTrigger(
      job,
      continuationTriggerId,
      nowFn(),
    );
    await upsertMotionCaptureJob(params.client, job);
  } else if (job.continuationTriggerId) {
    job = setMotionCaptureContinuationTrigger(job, undefined, nowFn());
    await upsertMotionCaptureJob(params.client, job);
  }

  const message = formatMotionCaptureMessage(
    params.deviceId,
    job.totalEventCount,
    job.uploadedCount,
    job.failedCount,
    remainingCount,
  );
  const updateResponse = await params.client.chat.update({
    channel: params.channelId,
    ts: job.threadTs,
    text: message,
  });
  if (!updateResponse.ok) {
    throw new Error(
      t("errors.api_call_failed", {
        error: updateResponse.error ?? "chat.update_failed",
      }),
    );
  }

  return {
    eventCount: job.totalEventCount,
    exportedImages: job.uploadedCount,
    message,
  };
}

export default SlackFunction(
  SoracomSoraCamMotionCaptureFunctionDefinition,
  async ({ inputs, client, env }) => {
    try {
      const validDeviceId = soraCamDeviceIdSchema.parse(inputs.device_id);

      console.log(
        t("soracom.logs.checking_soracam_motion", {
          deviceId: validDeviceId,
        }),
      );

      const result = await processMotionCaptureBatch({
        client: client as unknown as MotionCaptureClient,
        soracomClient: createSoracomClientFromEnv(env),
        channelId: inputs.channel_id,
        deviceId: validDeviceId,
      });

      return {
        outputs: {
          device_id: validDeviceId,
          event_count: result.eventCount,
          exported_images: result.exportedImages,
          message: result.message,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("soracom_soracam_motion_capture error:", errorMessage);
      return { error: errorMessage };
    }
  },
);
