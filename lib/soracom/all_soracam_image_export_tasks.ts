import { t } from "../i18n/mod.ts";
import SoracomAllSoraCamImageExportTasksDatastore from "../../datastores/soracom_all_soracam_image_export_tasks.ts";
import type { SoracomAllSoraCamImageExportTask } from "./types.ts";

interface AllSoraCamImageExportTaskDatastoreClient {
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
        cursor?: string;
        expression?: string;
        expression_attributes?: Record<string, string>;
        expression_values?: Record<string, unknown>;
        limit?: number;
      }) => Promise<{
        ok: boolean;
        items?: Array<Record<string, unknown>>;
        response_metadata?: {
          next_cursor?: string;
        };
        error?: string;
      }>;
      delete: (params: {
        datastore: string;
        id: string;
      }) => Promise<{ ok: boolean; error?: string }>;
    };
  };
}

export type SoracomAllSoraCamImageExportTaskInput = {
  taskKey: string;
  jobKey: string;
  channelId: string;
  deviceId: string;
  deviceName: string;
  sortIndex: number;
  claimId?: string;
  continuationTriggerId?: string;
  exportId: string;
  status: "queued" | "processing" | "uploaded" | "failed";
  imageUrl: string;
  snapshotTime?: number;
  slackFileId?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * 全台画像スナップショットタスクキーを生成します。
 *
 * @param jobKey - ジョブキー
 * @param deviceId - デバイス ID
 * @returns タスクキー
 */
export function buildAllSoraCamImageExportTaskKey(
  jobKey: string,
  deviceId: string,
): string {
  return `${jobKey}:${deviceId}`;
}

/**
 * 全台画像スナップショットタスクを Datastore に保存します。
 *
 * @param client - Slack API クライアント
 * @param task - 保存対象タスク
 */
export async function upsertAllSoraCamImageExportTask(
  client: AllSoraCamImageExportTaskDatastoreClient,
  task: SoracomAllSoraCamImageExportTaskInput,
): Promise<void> {
  const result = await client.apps.datastore.put({
    datastore: SoracomAllSoraCamImageExportTasksDatastore.definition.name,
    item: {
      task_key: task.taskKey,
      job_key: task.jobKey,
      channel_id: task.channelId,
      device_id: task.deviceId,
      device_name: task.deviceName,
      sort_index: task.sortIndex,
      ...(task.claimId ? { claim_id: task.claimId } : {}),
      ...(task.continuationTriggerId
        ? { continuation_trigger_id: task.continuationTriggerId }
        : {}),
      export_id: task.exportId,
      status: task.status,
      image_url: task.imageUrl,
      ...(task.snapshotTime === undefined
        ? {}
        : { snapshot_time: task.snapshotTime }),
      ...(task.slackFileId ? { slack_file_id: task.slackFileId } : {}),
      ...(task.errorMessage ? { error_message: task.errorMessage } : {}),
      created_at: task.createdAt,
      updated_at: task.updatedAt,
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
 * 全台画像スナップショットタスクを 1 件取得します。
 *
 * @param client - Slack API クライアント
 * @param taskKey - タスクキー
 * @returns 正規化済みタスクまたは null
 */
export async function getAllSoraCamImageExportTask(
  client: AllSoraCamImageExportTaskDatastoreClient,
  taskKey: string,
): Promise<SoracomAllSoraCamImageExportTask | null> {
  const result = await client.apps.datastore.get({
    datastore: SoracomAllSoraCamImageExportTasksDatastore.definition.name,
    id: taskKey,
  });

  if (!result.ok || !result.item) {
    return null;
  }

  return normalizeAllSoraCamImageExportTask(result.item);
}

/**
 * ジョブ配下の全台画像スナップショットタスクを一覧取得します。
 *
 * @param client - Slack API クライアント
 * @param jobKey - ジョブキー
 * @returns 正規化済みタスク一覧
 */
export async function listAllSoraCamImageExportTasks(
  client: AllSoraCamImageExportTaskDatastoreClient,
  jobKey: string,
): Promise<SoracomAllSoraCamImageExportTask[]> {
  const tasks: SoracomAllSoraCamImageExportTask[] = [];
  let cursor: string | undefined;

  do {
    const result = await client.apps.datastore.query({
      datastore: SoracomAllSoraCamImageExportTasksDatastore.definition.name,
      cursor,
      expression: "#job_key = :job_key",
      expression_attributes: {
        "#job_key": "job_key",
      },
      expression_values: {
        ":job_key": jobKey,
      },
      limit: 100,
    });

    if (!result.ok || !result.items) {
      return [];
    }

    tasks.push(
      ...result.items
        .map((item) => normalizeAllSoraCamImageExportTask(item))
        .filter((item): item is SoracomAllSoraCamImageExportTask =>
          item !== null && item.jobKey === jobKey
        ),
    );

    cursor = result.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return tasks
    .sort((left, right) =>
      left.sortIndex - right.sortIndex ||
      left.deviceId.localeCompare(right.deviceId)
    );
}

/**
 * ジョブ配下の全台画像スナップショットタスクを削除します。
 *
 * @param client - Slack API クライアント
 * @param jobKey - ジョブキー
 */
export async function deleteAllSoraCamImageExportTasksByJob(
  client: AllSoraCamImageExportTaskDatastoreClient,
  jobKey: string,
): Promise<void> {
  const tasks = await listAllSoraCamImageExportTasks(client, jobKey);

  for (const task of tasks) {
    const result = await client.apps.datastore.delete({
      datastore: SoracomAllSoraCamImageExportTasksDatastore.definition.name,
      id: task.taskKey,
    });

    if (!result.ok) {
      throw new Error(
        t("errors.api_call_failed", {
          error: result.error ?? "apps.datastore.delete_failed",
        }),
      );
    }
  }
}

function normalizeAllSoraCamImageExportTask(
  item: Record<string, unknown>,
): SoracomAllSoraCamImageExportTask | null {
  const taskKey = readNonEmptyString(item.task_key);
  const jobKey = readNonEmptyString(item.job_key);
  const channelId = readNonEmptyString(item.channel_id);
  const deviceId = readNonEmptyString(item.device_id);
  const deviceName = readNonEmptyString(item.device_name);
  const sortIndex = readNumber(item.sort_index);
  const claimId = readOptionalNonEmptyString(item.claim_id);
  const continuationTriggerId = readOptionalNonEmptyString(
    item.continuation_trigger_id,
  );
  const exportId = readString(item.export_id);
  const status = readTaskStatus(item.status);
  const imageUrl = readString(item.image_url);
  const snapshotTime = readNumber(item.snapshot_time);
  const slackFileId = readOptionalNonEmptyString(item.slack_file_id);
  const errorMessage = readOptionalNonEmptyString(item.error_message);
  const createdAt = readNonEmptyString(item.created_at);
  const updatedAt = readNonEmptyString(item.updated_at);

  if (
    taskKey === null ||
    jobKey === null ||
    channelId === null ||
    deviceId === null ||
    deviceName === null ||
    sortIndex === undefined ||
    exportId === null ||
    status === null ||
    imageUrl === null ||
    createdAt === null ||
    updatedAt === null
  ) {
    return null;
  }

  return {
    taskKey,
    jobKey,
    channelId,
    deviceId,
    deviceName,
    sortIndex,
    ...(claimId ? { claimId } : {}),
    ...(continuationTriggerId ? { continuationTriggerId } : {}),
    exportId,
    status,
    imageUrl,
    ...(snapshotTime === undefined ? {} : { snapshotTime }),
    ...(slackFileId ? { slackFileId } : {}),
    ...(errorMessage ? { errorMessage } : {}),
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

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readTaskStatus(
  value: unknown,
): SoracomAllSoraCamImageExportTask["status"] | null {
  return value === "queued" || value === "processing" || value === "uploaded" ||
      value === "failed"
    ? value
    : null;
}
