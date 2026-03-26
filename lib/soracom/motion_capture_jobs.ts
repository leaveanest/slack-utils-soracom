import { t } from "../i18n/mod.ts";
import SoracomMotionCaptureJobsDatastore from "../../datastores/soracom_motion_capture_jobs.ts";
import type { SoracomMotionCaptureJob } from "./types.ts";

interface MotionCaptureJobDatastoreClient {
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

export type SoracomMotionCaptureJobInput = {
  jobKey: string;
  channelId: string;
  deviceId: string;
  threadTs: string;
  windowStartMs: number;
  windowEndMs: number;
  eventTimes: number[];
  nextIndex: number;
  totalEventCount: number;
  uploadedCount: number;
  failedCount: number;
  claimId?: string;
  continuationTriggerId?: string;
  status: "starting" | "pending" | "completed";
  createdAt: string;
  updatedAt: string;
};

/**
 * 動体検知ジョブキーを生成します。
 *
 * @param channelId - チャンネル ID
 * @param deviceId - SoraCam デバイス ID
 * @returns ジョブキー
 */
export function buildMotionCaptureJobKey(
  channelId: string,
  deviceId: string,
): string {
  return `${channelId}:${deviceId}`;
}

/**
 * 動体検知ジョブを Datastore に保存します。
 *
 * @param client - Slack API クライアント
 * @param job - 保存対象ジョブ
 * @throws {Error} 保存に失敗した場合
 */
export async function upsertMotionCaptureJob(
  client: MotionCaptureJobDatastoreClient,
  job: SoracomMotionCaptureJobInput,
): Promise<void> {
  const result = await client.apps.datastore.put({
    datastore: SoracomMotionCaptureJobsDatastore.definition.name,
    item: {
      job_key: job.jobKey,
      channel_id: job.channelId,
      device_id: job.deviceId,
      thread_ts: job.threadTs,
      window_start_ms: job.windowStartMs,
      window_end_ms: job.windowEndMs,
      event_times_json: JSON.stringify(job.eventTimes),
      next_index: job.nextIndex,
      total_event_count: job.totalEventCount,
      uploaded_count: job.uploadedCount,
      failed_count: job.failedCount,
      ...(job.claimId ? { claim_id: job.claimId } : {}),
      ...(job.continuationTriggerId
        ? { continuation_trigger_id: job.continuationTriggerId }
        : {}),
      status: job.status,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
    },
  });

  if (!result.ok) {
    throw new Error(
      t("errors.api_call_failed", {
        error: result.error ?? "apps.datastore.put_failed",
      }),
    );
  }
}

/**
 * 動体検知ジョブを Datastore から削除します。
 *
 * @param client - Slack API クライアント
 * @param channelId - チャンネル ID
 * @param deviceId - デバイス ID
 * @throws {Error} 削除に失敗した場合
 */
export async function deleteMotionCaptureJob(
  client: MotionCaptureJobDatastoreClient,
  channelId: string,
  deviceId: string,
): Promise<void> {
  const result = await client.apps.datastore.delete({
    datastore: SoracomMotionCaptureJobsDatastore.definition.name,
    id: buildMotionCaptureJobKey(channelId, deviceId),
  });

  if (!result.ok) {
    throw new Error(
      t("errors.api_call_failed", {
        error: result.error ?? "apps.datastore.delete_failed",
      }),
    );
  }
}

/**
 * 保存済みの動体検知ジョブを取得します。
 *
 * @param client - Slack API クライアント
 * @param channelId - チャンネル ID
 * @param deviceId - デバイス ID
 * @returns 正規化済みジョブまたは null
 */
export async function getMotionCaptureJob(
  client: MotionCaptureJobDatastoreClient,
  channelId: string,
  deviceId: string,
): Promise<SoracomMotionCaptureJob | null> {
  const result = await client.apps.datastore.get({
    datastore: SoracomMotionCaptureJobsDatastore.definition.name,
    id: buildMotionCaptureJobKey(channelId, deviceId),
  });

  if (!result.ok || !result.item) {
    return null;
  }

  return normalizeMotionCaptureJob(result.item);
}

function normalizeMotionCaptureJob(
  item: Record<string, unknown>,
): SoracomMotionCaptureJob | null {
  const jobKey = readString(item.job_key);
  const channelId = readString(item.channel_id);
  const deviceId = readString(item.device_id);
  const threadTs = readString(item.thread_ts);
  const eventTimes = readEventTimes(item.event_times_json);
  const windowStartMs = readNumber(item.window_start_ms);
  const windowEndMs = readNumber(item.window_end_ms);
  const nextIndex = readNumber(item.next_index);
  const totalEventCount = readNumber(item.total_event_count);
  const uploadedCount = readNumber(item.uploaded_count);
  const failedCount = readNumber(item.failed_count);
  const claimId = readOptionalString(item.claim_id);
  const continuationTriggerId = readOptionalString(
    item.continuation_trigger_id,
  );
  const createdAt = readString(item.created_at);
  const updatedAt = readString(item.updated_at);
  const status = readStatus(item.status);

  if (
    jobKey === null ||
    channelId === null ||
    deviceId === null ||
    threadTs === null ||
    eventTimes === null ||
    windowStartMs === undefined ||
    windowEndMs === undefined ||
    nextIndex === undefined ||
    totalEventCount === undefined ||
    uploadedCount === undefined ||
    failedCount === undefined ||
    createdAt === null ||
    updatedAt === null ||
    status === null
  ) {
    return null;
  }

  return {
    jobKey,
    channelId,
    deviceId,
    threadTs,
    windowStartMs,
    windowEndMs,
    eventTimes,
    nextIndex,
    totalEventCount,
    uploadedCount,
    failedCount,
    ...(claimId ? { claimId } : {}),
    ...(continuationTriggerId ? { continuationTriggerId } : {}),
    status,
    createdAt,
    updatedAt,
  };
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readStatus(
  value: unknown,
): SoracomMotionCaptureJob["status"] | null {
  return value === "starting" || value === "pending" || value === "completed"
    ? value
    : null;
}

function readEventTimes(value: unknown): number[] | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.some((entry) =>
        typeof entry !== "number" || !Number.isFinite(entry)
      )
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
