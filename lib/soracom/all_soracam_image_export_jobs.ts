import { t } from "../i18n/mod.ts";
import SoracomAllSoraCamImageExportJobsDatastore from "../../datastores/soracom_all_soracam_image_export_jobs.ts";
import type { SoracomAllSoraCamImageExportJob } from "./types.ts";

interface AllSoraCamImageExportJobDatastoreClient {
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

export type SoracomAllSoraCamImageExportJobInput = {
  jobKey: string;
  channelId: string;
  messageTs: string;
  totalDeviceCount: number;
  claimId?: string;
  cleanupTriggerId?: string;
  status: "starting" | "pending" | "completed";
  createdAt: string;
  updatedAt: string;
};

/**
 * 全台画像スナップショットジョブキーを生成します。
 *
 * @param channelId - チャンネル ID
 * @returns ジョブキー
 */
export function buildAllSoraCamImageExportJobKey(channelId: string): string {
  return channelId;
}

/**
 * 全台画像スナップショットジョブを Datastore に保存します。
 *
 * @param client - Slack API クライアント
 * @param job - 保存対象ジョブ
 * @throws {Error} 保存に失敗した場合
 */
export async function upsertAllSoraCamImageExportJob(
  client: AllSoraCamImageExportJobDatastoreClient,
  job: SoracomAllSoraCamImageExportJobInput,
): Promise<void> {
  const result = await client.apps.datastore.put({
    datastore: SoracomAllSoraCamImageExportJobsDatastore.definition.name,
    item: {
      job_key: job.jobKey,
      channel_id: job.channelId,
      message_ts: job.messageTs,
      total_device_count: job.totalDeviceCount,
      ...(job.claimId ? { claim_id: job.claimId } : {}),
      ...(job.cleanupTriggerId
        ? { cleanup_trigger_id: job.cleanupTriggerId }
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
 * 全台画像スナップショットジョブを Datastore から削除します。
 *
 * @param client - Slack API クライアント
 * @param channelId - チャンネル ID
 * @throws {Error} 削除に失敗した場合
 */
export async function deleteAllSoraCamImageExportJob(
  client: AllSoraCamImageExportJobDatastoreClient,
  channelId: string,
): Promise<void> {
  const result = await client.apps.datastore.delete({
    datastore: SoracomAllSoraCamImageExportJobsDatastore.definition.name,
    id: buildAllSoraCamImageExportJobKey(channelId),
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
 * 保存済みの全台画像スナップショットジョブを取得します。
 *
 * @param client - Slack API クライアント
 * @param channelId - チャンネル ID
 * @returns 正規化済みジョブまたは null
 */
export async function getAllSoraCamImageExportJob(
  client: AllSoraCamImageExportJobDatastoreClient,
  channelId: string,
): Promise<SoracomAllSoraCamImageExportJob | null> {
  const result = await client.apps.datastore.get({
    datastore: SoracomAllSoraCamImageExportJobsDatastore.definition.name,
    id: buildAllSoraCamImageExportJobKey(channelId),
  });

  if (!result.ok || !result.item) {
    return null;
  }

  return normalizeAllSoraCamImageExportJob(result.item);
}

function normalizeAllSoraCamImageExportJob(
  item: Record<string, unknown>,
): SoracomAllSoraCamImageExportJob | null {
  const jobKey = readNonEmptyString(item.job_key);
  const channelId = readNonEmptyString(item.channel_id);
  const messageTs = readNonEmptyString(item.message_ts);
  const totalDeviceCount = readNumber(item.total_device_count);
  const claimId = readOptionalNonEmptyString(item.claim_id);
  const cleanupTriggerId = readOptionalNonEmptyString(item.cleanup_trigger_id);
  const createdAt = readNonEmptyString(item.created_at);
  const updatedAt = readNonEmptyString(item.updated_at);
  const status = readStatus(item.status);

  if (
    jobKey === null ||
    channelId === null ||
    messageTs === null ||
    totalDeviceCount === undefined ||
    createdAt === null ||
    updatedAt === null ||
    status === null
  ) {
    return null;
  }

  return {
    jobKey,
    channelId,
    messageTs,
    totalDeviceCount,
    ...(claimId ? { claimId } : {}),
    ...(cleanupTriggerId ? { cleanupTriggerId } : {}),
    status,
    createdAt,
    updatedAt,
  };
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readOptionalNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readStatus(
  value: unknown,
): SoracomAllSoraCamImageExportJob["status"] | null {
  return value === "starting" || value === "pending" || value === "completed"
    ? value
    : null;
}
