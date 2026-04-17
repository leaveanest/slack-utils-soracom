import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { t } from "../../lib/i18n/mod.ts";
import {
  type SlackApiClient,
  uploadSlackFileToChannel,
} from "../../lib/slack/file_upload.ts";
import {
  createScheduledWorkflowTrigger,
  resolveWorkflowAppId,
} from "../../lib/slack/workflow_trigger.ts";
import {
  buildAllSoraCamImageExportJobKey,
  buildAllSoraCamImageExportTaskKey,
  buildSoraCamSnapshotFileName,
  buildSoraCamSnapshotTitle,
  createSoracomClientFromEnv,
  deleteAllSoraCamImageExportJob,
  deleteAllSoraCamImageExportTasksByJob,
  downloadSoraCamSnapshot,
  formatSoraCamImageExportReport,
  getAllSoraCamImageExportJob,
  getAllSoraCamImageExportTask,
  listAllSoraCamImageExportTasks,
  pickSoraCamSnapshotTime,
  resolveSoraCamSnapshotTime,
  summarizeSoraCamImageExportResults,
  upsertAllSoraCamImageExportJob,
  upsertAllSoraCamImageExportTask,
} from "../../lib/soracom/mod.ts";
import type {
  SoraCamDevice,
  SoraCamImageExport,
  SoraCamImageExportReportResult,
  SoracomAllSoraCamImageExportJob,
  SoracomAllSoraCamImageExportTask,
  SoracomClient,
} from "../../lib/soracom/mod.ts";

// Slack channel writes are effectively paced per conversation, so all-device
// snapshot uploads should advance one camera at a time.
export const ALL_SORACAM_EXPORT_PARALLELISM = 1;
// Keep the next-device continuation close enough for practical throughput while
// leaving breathing room between channel write events.
export const ALL_SORACAM_EXPORT_TRIGGER_DELAY_MS = 1_500;
export const ALL_SORACAM_EXPORT_JOB_CLAIM_SETTLE_MS = 750;
export const ALL_SORACAM_EXPORT_TASK_CLAIM_SETTLE_MS = 750;
export const ALL_SORACAM_EXPORT_CREATION_WAIT_RETRIES = 20;
export const ALL_SORACAM_EXPORT_CREATION_WAIT_INTERVAL_MS = 250;
export const ALL_SORACAM_EXPORT_TASK_RETRY_DELAY_MS = 3_000;
export const ALL_SORACAM_EXPORT_STALE_UNSTARTED_TASK_MS = 60_000;
export const ALL_SORACAM_EXPORT_MAX_TASK_RETRIES = 2;
export const ALL_SORACAM_EXPORT_FAILED_DETAIL_LIMIT = 3;
export const ALL_SORACAM_EXPORT_CLEANUP_DELAY_MS = 60_000;
export const ALL_SORACAM_EXPORT_CLEANUP_TASK_KEY = "__cleanup__";

const ALL_SORACAM_EXPORT_WORKFLOW_CALLBACK_ID =
  "soracom_export_all_soracam_images_workflow";
const ALL_SORACAM_EXPORT_PENDING_MESSAGE_TS = "__pending__";

type AllSoraCamImageExportRunMode = "parent" | "worker" | "cleanup";

/**
 * 全ソラカメ画像スナップショット結果
 */
export type SoraCamBatchImageExportResult = SoraCamImageExportReportResult;

/**
 * 全ソラカメ画像スナップショット関数定義
 */
export const SoracomExportAllSoraCamImagesFunctionDefinition = DefineFunction({
  callback_id: "soracom_export_all_soracam_images",
  title: "ソラカメ全台画像スナップショット",
  description:
    "すべての ソラカメ デバイスから画像スナップショットを取得して共有します",
  source_file: "functions/soracom_export_all_soracam_images/mod.ts",
  input_parameters: {
    properties: {
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "結果を投稿するチャンネル",
      },
      job_key: {
        type: Schema.types.string,
        description: "内部用ジョブキー",
      },
      task_key: {
        type: Schema.types.string,
        description: "内部用タスクキー",
      },
      cleanup_claim_id: {
        type: Schema.types.string,
        description: "内部用 cleanup claim ID",
      },
    },
    required: ["channel_id"],
  },
  output_parameters: {
    properties: {
      device_count: {
        type: Schema.types.number,
        description: "対象デバイス数",
      },
      completed_count: {
        type: Schema.types.number,
        description: "完了したスナップショット数",
      },
      processing_count: {
        type: Schema.types.number,
        description: "処理中のスナップショット数",
      },
      failed_count: {
        type: Schema.types.number,
        description: "失敗したスナップショット数",
      },
      message: {
        type: Schema.types.string,
        description: "整形済みのスナップショット結果メッセージ",
      },
    },
    required: [
      "device_count",
      "completed_count",
      "processing_count",
      "failed_count",
      "message",
    ],
  },
});

interface AllSoraCamImageExportDatastoreClient {
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
      query: (params: {
        datastore: string;
      }) => Promise<{
        ok: boolean;
        items?: Array<Record<string, unknown>>;
        error?: string;
      }>;
      delete: (params: {
        datastore: string;
        id: string;
      }) => Promise<{ ok: boolean; error?: string }>;
    };
  };
}

interface AllSoraCamImageExportChatClient {
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

interface AllSoraCamImageExportTriggerClient {
  workflows: {
    triggers: {
      create: (params: Record<string, unknown>) => Promise<{
        ok: boolean;
        error?: string;
        trigger?: { id?: string };
      }>;
      delete: (params: { trigger_id: string }) => Promise<{
        ok: boolean;
        error?: string;
      }>;
    };
  };
}

type AllSoraCamImageExportClient =
  & SlackApiClient
  & AllSoraCamImageExportDatastoreClient
  & AllSoraCamImageExportChatClient
  & AllSoraCamImageExportTriggerClient;

type DelayFn = (ms: number) => Promise<void>;

type AllSoraCamImageExportSummary = {
  uploaded: number;
  processing: number;
  failed: number;
  queued: number;
  remaining: number;
};

type AllSoraCamImageExportResult = {
  deviceCount: number;
  completedCount: number;
  processingCount: number;
  failedCount: number;
  message: string;
};

type FailedAllSoraCamImageExportTaskDetail = {
  deviceId: string;
  deviceName: string;
  errorMessage: string;
};

function resolveAllSoraCamImageExportRunMode(params: {
  jobKey?: string;
  taskKey?: string;
}): AllSoraCamImageExportRunMode {
  if (
    params.jobKey &&
    params.taskKey === ALL_SORACAM_EXPORT_CLEANUP_TASK_KEY
  ) {
    return "cleanup";
  }

  if (params.jobKey && params.taskKey) {
    return "worker";
  }

  return "parent";
}

/**
 * エクスポート結果件数を状態ごとに集計します。
 *
 * @param results - 全デバイスのエクスポート結果
 * @returns 状態別の件数
 */
export function summarizeSoraCamBatchImageExportResults(
  results: SoraCamBatchImageExportResult[],
): {
  completed: number;
  processing: number;
  failed: number;
} {
  return summarizeSoraCamImageExportResults(results);
}

/**
 * 全ソラカメ画像スナップショット結果をフォーマットされたメッセージに変換します。
 *
 * @param results - 全デバイスのエクスポート結果
 * @returns フォーマットされたSlackメッセージ文字列
 */
export function formatSoraCamBatchImageExportMessage(
  results: SoraCamBatchImageExportResult[],
): string {
  return formatSoraCamImageExportReport(
    t("soracom.messages.soracam_all_image_exports_header", {
      count: results.length,
    }),
    results,
  );
}

/**
 * 開始時の進捗メッセージを生成します。
 *
 * @param deviceCount - 対象デバイス数
 * @param batchCount - 今回の最大処理台数
 * @returns フォーマット済みメッセージ
 */
export function formatPendingAllSoraCamImageExportMessage(
  deviceCount: number,
  batchCount: number,
): string {
  if (deviceCount === 0) {
    return t("soracom.messages.soracam_no_devices");
  }

  return [
    `*${
      t("soracom.messages.soracam_all_image_exports_header", {
        count: deviceCount,
      })
    }*`,
    t("soracom.messages.soracam_all_image_exports_pending", {
      batchCount,
    }),
    t("soracom.messages.soracam_all_image_exports_channel_notice"),
  ].join("\n");
}

/**
 * 進捗メッセージを生成します。
 *
 * @param deviceCount - 対象デバイス数
 * @param uploadedCount - アップロード済み件数
 * @param processingCount - 処理中件数
 * @param failedCount - 失敗件数
 * @param remainingCount - 残件数
 * @returns フォーマット済みメッセージ
 */
export function formatAllSoraCamImageExportMessage(
  deviceCount: number,
  uploadedCount: number,
  processingCount: number,
  failedCount: number,
  remainingCount: number,
  failedTasks: FailedAllSoraCamImageExportTaskDetail[] = [],
): string {
  if (deviceCount === 0) {
    return t("soracom.messages.soracam_no_devices");
  }

  const lines = [
    `*${
      t("soracom.messages.soracam_all_image_exports_header", {
        count: deviceCount,
      })
    }*`,
    t("soracom.messages.soracam_all_image_exports_progress", {
      uploaded: uploadedCount,
      processing: processingCount,
      failed: failedCount,
      remaining: remainingCount,
    }),
  ];

  if (failedTasks.length > 0) {
    const visibleFailedTasks = failedTasks.slice(
      0,
      ALL_SORACAM_EXPORT_FAILED_DETAIL_LIMIT,
    );
    lines.push(
      t("soracom.messages.soracam_all_image_exports_failed_details_header"),
    );
    lines.push(
      ...visibleFailedTasks.map((task) =>
        t("soracom.messages.soracam_all_image_exports_failed_details_item", {
          deviceName: task.deviceName,
          deviceId: task.deviceId,
          message: task.errorMessage,
        })
      ),
    );

    if (failedTasks.length > visibleFailedTasks.length) {
      lines.push(
        t("soracom.messages.soracam_all_image_exports_failed_details_more", {
          count: failedTasks.length - visibleFailedTasks.length,
        }),
      );
    }
  }

  lines.push(t("soracom.messages.soracam_all_image_exports_channel_notice"));

  if (remainingCount > 0) {
    lines.push(t("soracom.messages.soracam_all_image_exports_resume_notice"));
  } else {
    lines.push(t("soracom.messages.soracam_all_image_exports_completed"));
  }

  return lines.join("\n");
}

function summarizeAllSoraCamImageExportTasks(
  tasks: SoracomAllSoraCamImageExportTask[],
): AllSoraCamImageExportSummary {
  let uploaded = 0;
  let processing = 0;
  let failed = 0;
  let queued = 0;

  for (const task of tasks) {
    if (task.status === "uploaded") {
      uploaded += 1;
    } else if (task.status === "processing") {
      processing += 1;
    } else if (task.status === "failed") {
      failed += 1;
    } else {
      queued += 1;
    }
  }

  return {
    uploaded,
    processing,
    failed,
    queued,
    remaining: processing + queued,
  };
}

function createQueuedAllSoraCamImageExportTask(
  jobKey: string,
  channelId: string,
  device: SoraCamDevice,
  sortIndex: number,
  now: number,
): SoracomAllSoraCamImageExportTask {
  const timestamp = new Date(now).toISOString();
  return {
    taskKey: buildAllSoraCamImageExportTaskKey(jobKey, device.deviceId),
    jobKey,
    channelId,
    deviceId: device.deviceId,
    deviceName: device.name || device.deviceId,
    sortIndex,
    exportId: "",
    status: "queued",
    imageUrl: "",
    retryCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function withProcessingClaim(
  task: SoracomAllSoraCamImageExportTask,
  claimId: string,
  now: number,
): SoracomAllSoraCamImageExportTask {
  return {
    ...task,
    claimId,
    continuationTriggerId: undefined,
    status: "processing",
    errorMessage: undefined,
    updatedAt: new Date(now).toISOString(),
  };
}

function withoutClaim(
  task: SoracomAllSoraCamImageExportTask,
  now: number,
): SoracomAllSoraCamImageExportTask {
  return {
    ...task,
    claimId: undefined,
    continuationTriggerId: undefined,
    updatedAt: new Date(now).toISOString(),
  };
}

function isStaleUnstartedAllSoraCamImageExportTask(
  task: SoracomAllSoraCamImageExportTask,
  now: number,
): boolean {
  if (task.status !== "processing" || task.exportId.length > 0) {
    return false;
  }

  const updatedAt = Date.parse(task.updatedAt);
  return Number.isFinite(updatedAt) &&
    now - updatedAt >= ALL_SORACAM_EXPORT_STALE_UNSTARTED_TASK_MS;
}

function isStaleProcessingAllSoraCamImageExportTask(
  task: SoracomAllSoraCamImageExportTask,
  now: number,
): boolean {
  if (task.status !== "processing") {
    return false;
  }

  const updatedAt = Date.parse(task.updatedAt);
  return Number.isFinite(updatedAt) &&
    now - updatedAt >= ALL_SORACAM_EXPORT_STALE_UNSTARTED_TASK_MS;
}

function markTaskUploaded(
  task: SoracomAllSoraCamImageExportTask,
  exportId: string,
  imageUrl: string,
  snapshotTime: number,
  slackFileId: string,
  now: number,
): SoracomAllSoraCamImageExportTask {
  return {
    ...task,
    claimId: undefined,
    continuationTriggerId: undefined,
    exportId,
    status: "uploaded",
    imageUrl,
    snapshotTime,
    slackFileId,
    errorMessage: undefined,
    updatedAt: new Date(now).toISOString(),
  };
}

function markTaskFailed(
  task: SoracomAllSoraCamImageExportTask,
  errorMessage: string,
  now: number,
): SoracomAllSoraCamImageExportTask {
  return {
    ...task,
    claimId: undefined,
    continuationTriggerId: undefined,
    status: "failed",
    errorMessage,
    updatedAt: new Date(now).toISOString(),
  };
}

function markTaskProcessing(
  task: SoracomAllSoraCamImageExportTask,
  exportId: string,
  snapshotTime: number,
  now: number,
): SoracomAllSoraCamImageExportTask {
  return {
    ...task,
    continuationTriggerId: undefined,
    exportId,
    status: "processing",
    snapshotTime,
    errorMessage: undefined,
    updatedAt: new Date(now).toISOString(),
  };
}

function markTaskQueuedForRetry(
  task: SoracomAllSoraCamImageExportTask,
  errorMessage: string,
  now: number,
): SoracomAllSoraCamImageExportTask {
  return {
    ...task,
    claimId: undefined,
    continuationTriggerId: undefined,
    exportId: "",
    status: "queued",
    imageUrl: "",
    snapshotTime: undefined,
    slackFileId: undefined,
    retryCount: (task.retryCount ?? 0) + 1,
    errorMessage,
    updatedAt: new Date(now).toISOString(),
  };
}

function buildFailedTaskDetails(
  tasks: SoracomAllSoraCamImageExportTask[],
): FailedAllSoraCamImageExportTaskDetail[] {
  return tasks
    .filter((task) => task.status === "failed" && !!task.errorMessage)
    .map((task) => ({
      deviceId: task.deviceId,
      deviceName: task.deviceName,
      errorMessage: task.errorMessage!,
    }));
}

function isNonRetryableAllSoraCamImageExportError(
  task: SoracomAllSoraCamImageExportTask,
  errorMessage: string,
): boolean {
  return errorMessage ===
    t("soracom.errors.soracam_no_recent_recordings", {
      deviceId: task.deviceId,
    });
}

function resolveFailedAllSoraCamImageExportTask(
  task: SoracomAllSoraCamImageExportTask,
  error: unknown,
  now: number,
): SoracomAllSoraCamImageExportTask {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const retryCount = task.retryCount ?? 0;

  if (
    retryCount < ALL_SORACAM_EXPORT_MAX_TASK_RETRIES &&
    !isNonRetryableAllSoraCamImageExportError(task, errorMessage)
  ) {
    return markTaskQueuedForRetry(task, errorMessage, now);
  }

  return markTaskFailed(task, errorMessage, now);
}

function createStartingAllSoraCamImageExportJob(
  channelId: string,
  claimId: string,
  now: number,
): SoracomAllSoraCamImageExportJob {
  const timestamp = new Date(now).toISOString();
  return {
    jobKey: buildAllSoraCamImageExportJobKey(channelId),
    channelId,
    messageTs: ALL_SORACAM_EXPORT_PENDING_MESSAGE_TS,
    totalDeviceCount: 0,
    claimId,
    status: "starting",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function withJobStatus(
  job: SoracomAllSoraCamImageExportJob,
  status: SoracomAllSoraCamImageExportJob["status"],
  now: number,
): SoracomAllSoraCamImageExportJob {
  return {
    ...job,
    status,
    updatedAt: new Date(now).toISOString(),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReadyAllSoraCamImageExportJob(
  client: AllSoraCamImageExportClient,
  channelId: string,
  delayFn: DelayFn,
): Promise<SoracomAllSoraCamImageExportJob | null> {
  for (
    let attempt = 0;
    attempt < ALL_SORACAM_EXPORT_CREATION_WAIT_RETRIES;
    attempt++
  ) {
    const job = await getAllSoraCamImageExportJob(client, channelId);
    if (job === null || job.status !== "starting") {
      return job;
    }
    await delayFn(ALL_SORACAM_EXPORT_CREATION_WAIT_INTERVAL_MS);
  }

  return await getAllSoraCamImageExportJob(client, channelId);
}

async function tryClaimAllSoraCamImageExportJobCreation(
  client: AllSoraCamImageExportClient,
  channelId: string,
  now: number,
  delayFn: DelayFn,
): Promise<
  {
    claimed: boolean;
    job: SoracomAllSoraCamImageExportJob | null;
    claimId: string;
  }
> {
  const claimId = crypto.randomUUID();
  await upsertAllSoraCamImageExportJob(
    client,
    createStartingAllSoraCamImageExportJob(channelId, claimId, now),
  );
  await delayFn(ALL_SORACAM_EXPORT_JOB_CLAIM_SETTLE_MS);

  const job = await getAllSoraCamImageExportJob(client, channelId);
  return {
    claimed: job?.status === "starting" && job.claimId === claimId,
    job,
    claimId,
  };
}

async function tryClaimAllSoraCamImageExportCompletion(
  client: AllSoraCamImageExportClient,
  job: SoracomAllSoraCamImageExportJob,
  now: number,
  delayFn: DelayFn,
): Promise<SoracomAllSoraCamImageExportJob | null> {
  const claimId = crypto.randomUUID();
  await upsertAllSoraCamImageExportJob(
    client,
    {
      ...withJobStatus(job, "completed", now),
      claimId,
    },
  );
  await delayFn(ALL_SORACAM_EXPORT_JOB_CLAIM_SETTLE_MS);

  const latestJob = await getAllSoraCamImageExportJob(client, job.channelId);
  if (
    latestJob?.jobKey === job.jobKey &&
    latestJob.status === "completed" &&
    latestJob.claimId === claimId
  ) {
    return latestJob;
  }

  return null;
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

async function createAllSoraCamImageExportJob(
  client: AllSoraCamImageExportClient,
  soracomClient: Pick<SoracomClient, "listSoraCamDevices">,
  channelId: string,
  now: number,
  claimId?: string,
): Promise<SoracomAllSoraCamImageExportJob | null> {
  const devices = await soracomClient.listSoraCamDevices();

  if (devices.length === 0) {
    return null;
  }

  const batchCount = Math.min(devices.length, ALL_SORACAM_EXPORT_PARALLELISM);
  const pendingMessage = formatPendingAllSoraCamImageExportMessage(
    devices.length,
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

  const messageTs = getPostedMessageTs(postResponse);
  if (!messageTs) {
    throw new Error(t("errors.data_not_found"));
  }

  const timestamp = new Date(now).toISOString();
  const job: SoracomAllSoraCamImageExportJob = {
    jobKey: buildAllSoraCamImageExportJobKey(channelId),
    channelId,
    messageTs,
    totalDeviceCount: devices.length,
    ...(claimId ? { claimId } : {}),
    status: "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await upsertAllSoraCamImageExportJob(client, job);

  for (const [index, device] of devices.entries()) {
    await upsertAllSoraCamImageExportTask(
      client,
      createQueuedAllSoraCamImageExportTask(
        job.jobKey,
        channelId,
        device,
        index,
        now,
      ),
    );
  }

  return job;
}

function buildScheduledTriggerStartTime(now: number, delayMs: number): string {
  return new Date(Math.max(now, Date.now()) + delayMs).toISOString();
}

async function scheduleAllSoraCamImageExportTaskRun(
  client: AllSoraCamImageExportClient,
  channelId: string,
  jobKey: string,
  taskKey: string,
  now: number,
  workflowAppId?: string,
  delayMs = ALL_SORACAM_EXPORT_TRIGGER_DELAY_MS,
): Promise<string> {
  const response = await createScheduledWorkflowTrigger({
    client,
    workflowCallbackId: ALL_SORACAM_EXPORT_WORKFLOW_CALLBACK_ID,
    name: t("soracom.messages.soracam_all_image_exports_trigger_name"),
    schedule: {
      start_time: buildScheduledTriggerStartTime(now, delayMs),
      frequency: {
        type: "once",
      },
    },
    inputs: {
      channel_id: { value: channelId },
      job_key: { value: jobKey },
      task_key: { value: taskKey },
    },
    workflowAppId,
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

async function scheduleAllSoraCamImageExportCleanupRun(
  client: AllSoraCamImageExportClient,
  channelId: string,
  jobKey: string,
  cleanupClaimId: string,
  now: number,
  workflowAppId?: string,
  delayMs = ALL_SORACAM_EXPORT_CLEANUP_DELAY_MS,
): Promise<string> {
  const response = await createScheduledWorkflowTrigger({
    client,
    workflowCallbackId: ALL_SORACAM_EXPORT_WORKFLOW_CALLBACK_ID,
    name: t("soracom.messages.soracam_all_image_exports_trigger_name"),
    schedule: {
      start_time: buildScheduledTriggerStartTime(now, delayMs),
      frequency: {
        type: "once",
      },
    },
    inputs: {
      channel_id: { value: channelId },
      job_key: { value: jobKey },
      task_key: { value: ALL_SORACAM_EXPORT_CLEANUP_TASK_KEY },
      cleanup_claim_id: { value: cleanupClaimId },
    },
    workflowAppId,
  });

  if (!response.ok) {
    throw new Error(
      t("errors.api_call_failed", {
        error: response.error ?? "workflows.triggers.create_failed",
      }),
    );
  }

  if (!response.trigger?.id) {
    throw new Error(t("errors.data_not_found"));
  }

  return response.trigger.id;
}

async function deleteAllSoraCamImageExportContinuationTrigger(
  client: AllSoraCamImageExportClient,
  triggerId: string,
): Promise<void> {
  const response = await client.workflows.triggers.delete({
    trigger_id: triggerId,
  });

  if (
    !response.ok && response.error && response.error !== "trigger_not_found"
  ) {
    console.warn(
      "soracom_export_all_soracam_images trigger delete warning:",
      response.error,
    );
  }
}

async function clearTaskContinuationTrigger(params: {
  client: AllSoraCamImageExportClient;
  task: SoracomAllSoraCamImageExportTask;
  now: number;
}): Promise<SoracomAllSoraCamImageExportTask> {
  if (!params.task.continuationTriggerId) {
    return params.task;
  }

  await deleteAllSoraCamImageExportContinuationTrigger(
    params.client,
    params.task.continuationTriggerId,
  );
  const nextTask = {
    ...params.task,
    continuationTriggerId: undefined,
    updatedAt: new Date(params.now).toISOString(),
  };
  await upsertAllSoraCamImageExportTask(params.client, nextTask);
  return nextTask;
}

async function clearCleanupContinuationTrigger(params: {
  client: AllSoraCamImageExportClient;
  job: SoracomAllSoraCamImageExportJob;
  now: number;
}): Promise<SoracomAllSoraCamImageExportJob> {
  if (!params.job.cleanupTriggerId) {
    return params.job;
  }

  await deleteAllSoraCamImageExportContinuationTrigger(
    params.client,
    params.job.cleanupTriggerId,
  );
  const nextJob = {
    ...params.job,
    cleanupTriggerId: undefined,
    updatedAt: new Date(params.now).toISOString(),
  };
  await upsertAllSoraCamImageExportJob(params.client, nextJob);
  return nextJob;
}

async function scheduleTaskContinuation(params: {
  client: AllSoraCamImageExportClient;
  task: SoracomAllSoraCamImageExportTask;
  now: number;
  workflowAppId?: string;
  delayMs?: number;
}): Promise<SoracomAllSoraCamImageExportTask> {
  const triggerId = await scheduleAllSoraCamImageExportTaskRun(
    params.client,
    params.task.channelId,
    params.task.jobKey,
    params.task.taskKey,
    params.now,
    params.workflowAppId,
    params.delayMs,
  );
  const nextTask = {
    ...params.task,
    continuationTriggerId: triggerId,
    updatedAt: new Date(params.now).toISOString(),
  };
  await upsertAllSoraCamImageExportTask(params.client, nextTask);
  return nextTask;
}

async function claimAllSoraCamImageExportTask(
  client: AllSoraCamImageExportClient,
  task: SoracomAllSoraCamImageExportTask,
  now: number,
  delayFn: DelayFn,
): Promise<SoracomAllSoraCamImageExportTask | null> {
  if (task.status !== "queued") {
    return null;
  }

  const claimId = crypto.randomUUID();
  await upsertAllSoraCamImageExportTask(
    client,
    withProcessingClaim(task, claimId, now),
  );
  await delayFn(ALL_SORACAM_EXPORT_TASK_CLAIM_SETTLE_MS);

  const latestTask = await getAllSoraCamImageExportTask(client, task.taskKey);
  if (
    latestTask?.status === "processing" &&
    latestTask.claimId === claimId
  ) {
    return latestTask;
  }

  return null;
}

async function claimNextQueuedAllSoraCamImageExportTask(
  client: AllSoraCamImageExportClient,
  jobKey: string,
  now: number,
  delayFn: DelayFn,
): Promise<SoracomAllSoraCamImageExportTask | null> {
  const tasks = (await listAllSoraCamImageExportTasks(client, jobKey))
    .sort((left, right) =>
      (left.retryCount ?? 0) - (right.retryCount ?? 0) ||
      left.sortIndex - right.sortIndex ||
      left.deviceId.localeCompare(right.deviceId)
    );

  for (const task of tasks) {
    const claimedTask = await claimAllSoraCamImageExportTask(
      client,
      task,
      now,
      delayFn,
    );
    if (claimedTask) {
      return claimedTask;
    }
  }

  return null;
}

async function fillAllSoraCamImageExportFanoutWindow(params: {
  client: AllSoraCamImageExportClient;
  job: SoracomAllSoraCamImageExportJob;
  now: number;
  workflowAppId?: string;
  delayFn: DelayFn;
}): Promise<void> {
  let tasks = await listAllSoraCamImageExportTasks(
    params.client,
    params.job.jobKey,
  );

  for (const task of tasks) {
    if (!isStaleProcessingAllSoraCamImageExportTask(task, params.now)) {
      continue;
    }

    const clearedTask = await clearTaskContinuationTrigger({
      client: params.client,
      task,
      now: params.now,
    });

    if (isStaleUnstartedAllSoraCamImageExportTask(clearedTask, params.now)) {
      await upsertAllSoraCamImageExportTask(params.client, {
        ...withoutClaim(clearedTask, params.now),
        status: "queued",
      });
      continue;
    }

    await scheduleTaskContinuation({
      client: params.client,
      task: {
        ...withoutClaim(clearedTask, params.now),
        status: "processing",
      },
      now: params.now,
      workflowAppId: params.workflowAppId,
    });
  }

  tasks = await listAllSoraCamImageExportTasks(
    params.client,
    params.job.jobKey,
  );
  let summary = summarizeAllSoraCamImageExportTasks(tasks);

  while (
    summary.processing < ALL_SORACAM_EXPORT_PARALLELISM && summary.queued > 0
  ) {
    const claimedTask = await claimNextQueuedAllSoraCamImageExportTask(
      params.client,
      params.job.jobKey,
      params.now,
      params.delayFn,
    );
    if (!claimedTask) {
      break;
    }

    try {
      await scheduleTaskContinuation({
        client: params.client,
        task: claimedTask,
        now: params.now,
        workflowAppId: params.workflowAppId,
      });
    } catch (error) {
      await upsertAllSoraCamImageExportTask(
        params.client,
        {
          ...withoutClaim(claimedTask, params.now),
          status: "queued",
        },
      );
      throw error;
    }

    tasks = await listAllSoraCamImageExportTasks(
      params.client,
      params.job.jobKey,
    );
    summary = summarizeAllSoraCamImageExportTasks(tasks);
  }
}

function assertSoraCamImageExportUsable(
  deviceId: string,
  exportResult: SoraCamImageExport,
): void {
  if (
    exportResult.status === "failed" ||
    exportResult.status === "limitExceeded" ||
    exportResult.status === "expired"
  ) {
    throw new Error(
      t("soracom.errors.soracam_image_export_failed", {
        deviceId,
        status: exportResult.status,
      }),
    );
  }

  if (!exportResult.exportId) {
    throw new Error(t("errors.data_not_found"));
  }
}

async function uploadCompletedSoraCamSnapshot(
  client: SlackApiClient,
  channelId: string,
  task: SoracomAllSoraCamImageExportTask,
  exportResult: SoraCamImageExport,
  snapshotTime: number,
  now: number,
): Promise<SoracomAllSoraCamImageExportTask> {
  if (!exportResult.url) {
    throw new Error(t("errors.data_not_found"));
  }

  const snapshotBytes = await downloadSoraCamSnapshot(
    task.deviceId,
    exportResult.url,
  );
  const slackFileId = await uploadSlackFileToChannel(
    client,
    channelId,
    snapshotBytes,
    {
      filename: buildSoraCamSnapshotFileName(task.deviceId, snapshotTime),
      title: buildSoraCamSnapshotTitle(task.deviceName, snapshotTime),
      contentType: "image/jpeg",
    },
  );

  return markTaskUploaded(
    task,
    exportResult.exportId,
    exportResult.url,
    snapshotTime,
    slackFileId,
    now,
  );
}

async function startQueuedSoraCamDeviceExport(
  soracomClient: Pick<
    SoracomClient,
    "listSoraCamRecordingsAndEvents" | "exportSoraCamImage"
  >,
  client: SlackApiClient,
  channelId: string,
  task: SoracomAllSoraCamImageExportTask,
  now: number,
): Promise<SoracomAllSoraCamImageExportTask> {
  try {
    const snapshotTime = await resolveSoraCamSnapshotTime(
      soracomClient,
      task.deviceId,
      now,
    );
    const exportResult = await soracomClient.exportSoraCamImage(
      task.deviceId,
      snapshotTime,
    );
    assertSoraCamImageExportUsable(task.deviceId, exportResult);

    if (exportResult.status === "completed" && exportResult.url) {
      return await uploadCompletedSoraCamSnapshot(
        client,
        channelId,
        task,
        exportResult,
        snapshotTime,
        now,
      );
    }

    return markTaskProcessing(task, exportResult.exportId, snapshotTime, now);
  } catch (error) {
    const nextTask = resolveFailedAllSoraCamImageExportTask(task, error, now);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `soracom_export_all_soracam_images start error (${task.deviceId}):`,
      errorMessage,
    );
    return nextTask;
  }
}

async function resumeProcessingSoraCamDeviceExport(
  soracomClient: Pick<SoracomClient, "getSoraCamImageExport">,
  client: SlackApiClient,
  channelId: string,
  task: SoracomAllSoraCamImageExportTask,
  now: number,
): Promise<SoracomAllSoraCamImageExportTask> {
  try {
    const exportResult = await soracomClient.getSoraCamImageExport(
      task.deviceId,
      task.exportId,
    );
    assertSoraCamImageExportUsable(task.deviceId, exportResult);

    if (
      exportResult.status === "completed" &&
      exportResult.url &&
      task.snapshotTime !== undefined
    ) {
      return await uploadCompletedSoraCamSnapshot(
        client,
        channelId,
        task,
        exportResult,
        task.snapshotTime,
        now,
      );
    }

    return {
      ...task,
      updatedAt: new Date(now).toISOString(),
    };
  } catch (error) {
    const nextTask = resolveFailedAllSoraCamImageExportTask(task, error, now);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `soracom_export_all_soracam_images resume error (${task.deviceId}):`,
      errorMessage,
    );
    return nextTask;
  }
}

async function refreshAllSoraCamImageExportProgress(params: {
  client: AllSoraCamImageExportClient;
  job: SoracomAllSoraCamImageExportJob;
  now: number;
  workflowAppId?: string;
  delayFn: DelayFn;
}): Promise<AllSoraCamImageExportResult> {
  const latestJob = await getAllSoraCamImageExportJob(
    params.client,
    params.job.channelId,
  );
  if (!latestJob || latestJob.jobKey !== params.job.jobKey) {
    return {
      deviceCount: params.job.totalDeviceCount,
      completedCount: 0,
      processingCount: 0,
      failedCount: 0,
      message: t("soracom.messages.soracam_no_devices"),
    };
  }

  if (latestJob.status === "completed" && params.job.status !== "completed") {
    return {
      deviceCount: latestJob.totalDeviceCount,
      completedCount: 0,
      processingCount: 0,
      failedCount: 0,
      message: formatAllSoraCamImageExportMessage(
        latestJob.totalDeviceCount,
        0,
        0,
        0,
        0,
      ),
    };
  }

  const tasks = await listAllSoraCamImageExportTasks(
    params.client,
    latestJob.jobKey,
  );
  const summary = summarizeAllSoraCamImageExportTasks(tasks);
  const nextStatus = summary.remaining === 0 ? "completed" : "pending";
  let nextJob: SoracomAllSoraCamImageExportJob;

  if (nextStatus === "completed") {
    const claimedJob = await tryClaimAllSoraCamImageExportCompletion(
      params.client,
      latestJob,
      params.now,
      params.delayFn,
    );

    if (!claimedJob) {
      return {
        deviceCount: latestJob.totalDeviceCount,
        completedCount: summary.uploaded,
        processingCount: summary.processing,
        failedCount: summary.failed,
        message: formatAllSoraCamImageExportMessage(
          latestJob.totalDeviceCount,
          summary.uploaded,
          summary.processing,
          summary.failed,
          summary.remaining,
          buildFailedTaskDetails(tasks),
        ),
      };
    }

    nextJob = claimedJob;
  } else {
    nextJob = withJobStatus(latestJob, nextStatus, params.now);
    await upsertAllSoraCamImageExportJob(params.client, nextJob);
  }

  const message = formatAllSoraCamImageExportMessage(
    nextJob.totalDeviceCount,
    summary.uploaded,
    summary.processing,
    summary.failed,
    summary.remaining,
    buildFailedTaskDetails(tasks),
  );
  const response = await params.client.chat.update({
    channel: nextJob.channelId,
    ts: nextJob.messageTs,
    text: message,
  });

  if (!response.ok) {
    throw new Error(
      t("errors.api_call_failed", {
        error: response.error ?? "chat.update_failed",
      }),
    );
  }

  if (nextStatus === "completed" && nextJob.claimId) {
    const cleanupTriggerId = await scheduleAllSoraCamImageExportCleanupRun(
      params.client,
      nextJob.channelId,
      nextJob.jobKey,
      nextJob.claimId,
      params.now,
      params.workflowAppId,
    );
    nextJob = {
      ...nextJob,
      cleanupTriggerId,
      updatedAt: new Date(params.now).toISOString(),
    };
    await upsertAllSoraCamImageExportJob(params.client, nextJob);
  }

  return {
    deviceCount: nextJob.totalDeviceCount,
    completedCount: summary.uploaded,
    processingCount: summary.processing,
    failedCount: summary.failed,
    message,
  };
}

async function processAllSoraCamImageExportWorker(params: {
  soracomClient: Pick<
    SoracomClient,
    | "listSoraCamRecordingsAndEvents"
    | "exportSoraCamImage"
    | "getSoraCamImageExport"
  >;
  client: AllSoraCamImageExportClient;
  channelId: string;
  jobKey: string;
  taskKey: string;
  now: number;
  workflowAppId?: string;
  delayFn: DelayFn;
}): Promise<AllSoraCamImageExportResult> {
  const job = await getAllSoraCamImageExportJob(
    params.client,
    params.channelId,
  );
  if (!job || job.jobKey !== params.jobKey || job.status === "completed") {
    return {
      deviceCount: job?.totalDeviceCount ?? 0,
      completedCount: 0,
      processingCount: 0,
      failedCount: 0,
      message: job
        ? formatAllSoraCamImageExportMessage(job.totalDeviceCount, 0, 0, 0, 0)
        : t("soracom.messages.soracam_no_devices"),
    };
  }

  const task = await getAllSoraCamImageExportTask(
    params.client,
    params.taskKey,
  );
  const nextTaskBase = task
    ? await clearTaskContinuationTrigger({
      client: params.client,
      task,
      now: params.now,
    })
    : null;
  if (
    !nextTaskBase ||
    nextTaskBase.jobKey !== params.jobKey ||
    nextTaskBase.status === "uploaded" ||
    nextTaskBase.status === "failed"
  ) {
    return await refreshAllSoraCamImageExportProgress({
      client: params.client,
      job,
      now: params.now,
      workflowAppId: params.workflowAppId,
      delayFn: params.delayFn,
    });
  }

  const nextTask = nextTaskBase.exportId
    ? await resumeProcessingSoraCamDeviceExport(
      params.soracomClient,
      params.client,
      params.channelId,
      nextTaskBase,
      params.now,
    )
    : await startQueuedSoraCamDeviceExport(
      params.soracomClient,
      params.client,
      params.channelId,
      nextTaskBase,
      params.now,
    );

  if (nextTask.status === "processing" && nextTask.exportId) {
    await scheduleTaskContinuation({
      client: params.client,
      task: nextTask,
      now: params.now,
      workflowAppId: params.workflowAppId,
      delayMs: ALL_SORACAM_EXPORT_TASK_RETRY_DELAY_MS,
    });
  } else {
    await upsertAllSoraCamImageExportTask(params.client, nextTask);
    await fillAllSoraCamImageExportFanoutWindow({
      client: params.client,
      job,
      now: params.now,
      workflowAppId: params.workflowAppId,
      delayFn: params.delayFn,
    });
  }

  return await refreshAllSoraCamImageExportProgress({
    client: params.client,
    job,
    now: params.now,
    workflowAppId: params.workflowAppId,
    delayFn: params.delayFn,
  });
}

async function cleanupCompletedAllSoraCamImageExport(params: {
  client: AllSoraCamImageExportClient;
  channelId: string;
  jobKey: string;
  cleanupClaimId?: string;
  now: number;
}): Promise<AllSoraCamImageExportResult> {
  const job = await getAllSoraCamImageExportJob(
    params.client,
    params.channelId,
  );
  if (
    !job ||
    job.jobKey !== params.jobKey ||
    job.status !== "completed" ||
    job.claimId !== params.cleanupClaimId
  ) {
    return {
      deviceCount: job?.totalDeviceCount ?? 0,
      completedCount: 0,
      processingCount: 0,
      failedCount: 0,
      message: job
        ? formatAllSoraCamImageExportMessage(job.totalDeviceCount, 0, 0, 0, 0)
        : t("soracom.messages.soracam_no_devices"),
    };
  }

  const claimedCleanupJob = await clearCleanupContinuationTrigger({
    client: params.client,
    job,
    now: params.now,
  });

  const tasks = await listAllSoraCamImageExportTasks(
    params.client,
    params.jobKey,
  );
  const summary = summarizeAllSoraCamImageExportTasks(tasks);
  const message = formatAllSoraCamImageExportMessage(
    claimedCleanupJob.totalDeviceCount,
    summary.uploaded,
    summary.processing,
    summary.failed,
    summary.remaining,
    buildFailedTaskDetails(tasks),
  );

  if (summary.remaining > 0) {
    return {
      deviceCount: claimedCleanupJob.totalDeviceCount,
      completedCount: summary.uploaded,
      processingCount: summary.processing,
      failedCount: summary.failed,
      message,
    };
  }

  const latestJob = await getAllSoraCamImageExportJob(
    params.client,
    params.channelId,
  );
  if (
    !latestJob ||
    latestJob.jobKey !== params.jobKey ||
    latestJob.status !== "completed" ||
    latestJob.claimId !== params.cleanupClaimId
  ) {
    return {
      deviceCount: latestJob?.totalDeviceCount ?? job.totalDeviceCount,
      completedCount: 0,
      processingCount: 0,
      failedCount: 0,
      message: latestJob
        ? formatAllSoraCamImageExportMessage(
          latestJob.totalDeviceCount,
          0,
          0,
          0,
          0,
        )
        : t("soracom.messages.soracam_no_devices"),
    };
  }

  await deleteAllSoraCamImageExportTasksByJob(params.client, params.jobKey);
  await deleteAllSoraCamImageExportJob(params.client, params.channelId);

  return {
    deviceCount: job.totalDeviceCount,
    completedCount: summary.uploaded,
    processingCount: summary.processing,
    failedCount: summary.failed,
    message,
  };
}

/**
 * 全台画像スナップショットの親 orchestration を実行します。
 *
 * @param params - 実行パラメータ
 * @returns 現在の進捗
 */
export async function processAllSoraCamImageExport(params: {
  soracomClient: Pick<
    SoracomClient,
    | "listSoraCamDevices"
    | "listSoraCamRecordingsAndEvents"
    | "exportSoraCamImage"
    | "getSoraCamImageExport"
  >;
  client: AllSoraCamImageExportClient;
  channelId: string;
  jobKey?: string;
  taskKey?: string;
  cleanupClaimId?: string;
  workflowAppId?: string;
  now?: number;
  nowFn?: () => number;
  delayFn?: DelayFn;
}): Promise<AllSoraCamImageExportResult> {
  const nowFn = params.nowFn ?? (() => params.now ?? Date.now());
  const delayFn = params.delayFn ?? sleep;
  const now = params.now ?? nowFn();

  if (
    params.jobKey &&
    params.taskKey === ALL_SORACAM_EXPORT_CLEANUP_TASK_KEY
  ) {
    return await cleanupCompletedAllSoraCamImageExport({
      client: params.client,
      channelId: params.channelId,
      jobKey: params.jobKey,
      cleanupClaimId: params.cleanupClaimId,
      now,
    });
  }

  if (params.jobKey && params.taskKey) {
    return await processAllSoraCamImageExportWorker({
      soracomClient: params.soracomClient,
      client: params.client,
      channelId: params.channelId,
      jobKey: params.jobKey,
      taskKey: params.taskKey,
      now,
      workflowAppId: params.workflowAppId,
      delayFn,
    });
  }

  let job = await getAllSoraCamImageExportJob(params.client, params.channelId);

  if (job?.status === "starting") {
    job = await waitForReadyAllSoraCamImageExportJob(
      params.client,
      params.channelId,
      delayFn,
    );
  }

  if (job === null || job.status === "completed") {
    const claimResult = await tryClaimAllSoraCamImageExportJobCreation(
      params.client,
      params.channelId,
      now,
      delayFn,
    );

    if (claimResult.claimed) {
      await deleteAllSoraCamImageExportTasksByJob(
        params.client,
        buildAllSoraCamImageExportJobKey(params.channelId),
      );
      job = await createAllSoraCamImageExportJob(
        params.client,
        params.soracomClient,
        params.channelId,
        now,
        claimResult.claimId,
      );
    } else {
      job = await waitForReadyAllSoraCamImageExportJob(
        params.client,
        params.channelId,
        delayFn,
      );
    }

    if (job === null) {
      await deleteAllSoraCamImageExportJob(params.client, params.channelId);
      const message = t("soracom.messages.soracam_no_devices");
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
        deviceCount: 0,
        completedCount: 0,
        processingCount: 0,
        failedCount: 0,
        message,
      };
    }
  }

  if (job.status === "starting") {
    throw new Error("all_soracam_image_export_job_initializing");
  }

  await fillAllSoraCamImageExportFanoutWindow({
    client: params.client,
    job,
    now,
    workflowAppId: params.workflowAppId,
    delayFn,
  });

  return await refreshAllSoraCamImageExportProgress({
    client: params.client,
    job,
    now,
    workflowAppId: params.workflowAppId,
    delayFn,
  });
}

export default SlackFunction(
  SoracomExportAllSoraCamImagesFunctionDefinition,
  async (context) => {
    try {
      const { inputs, client, env } = context;
      const runMode = resolveAllSoraCamImageExportRunMode({
        jobKey: inputs.job_key,
        taskKey: inputs.task_key,
      });
      const slackClient = client as unknown as AllSoraCamImageExportClient;
      const workflowAppId = await resolveWorkflowAppId({
        client: slackClient,
        env,
        body: (context as { body?: unknown }).body,
      });

      console.log(t("soracom.logs.exporting_all_soracam_images"));
      console.log(t("soracom.logs.fetching_soracam_recordings"));
      console.log(
        t("soracom.logs.soracam_all_image_exports_run_mode", {
          mode: runMode,
          channelId: inputs.channel_id,
          jobKey: inputs.job_key ?? "-",
          taskKey: inputs.task_key ?? "-",
        }),
      );

      const soracomClient = createSoracomClientFromEnv(env);
      const result = await processAllSoraCamImageExport({
        soracomClient,
        client: slackClient,
        channelId: inputs.channel_id,
        jobKey: inputs.job_key,
        taskKey: inputs.task_key,
        cleanupClaimId: inputs.cleanup_claim_id,
        workflowAppId,
      });

      console.log(
        t("soracom.logs.soracam_all_image_exports_result_summary", {
          mode: runMode,
          deviceCount: result.deviceCount,
          completed: result.completedCount,
          processing: result.processingCount,
          failed: result.failedCount,
        }),
      );
      console.log(
        result.processingCount > 0
          ? t("soracom.logs.soracam_all_image_exports_continuing")
          : t("soracom.logs.soracam_all_image_exports_finished"),
      );

      return {
        outputs: {
          device_count: result.deviceCount,
          completed_count: result.completedCount,
          processing_count: result.processingCount,
          failed_count: result.failedCount,
          message: result.message,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("soracom_export_all_soracam_images error:", errorMessage);
      return { error: errorMessage };
    }
  },
);

export { pickSoraCamSnapshotTime };
