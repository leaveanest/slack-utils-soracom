import { assertEquals } from "std/testing/asserts.ts";
import {
  buildAllSoraCamImageExportJobKey,
  getAllSoraCamImageExportJob,
  upsertAllSoraCamImageExportJob,
} from "./all_soracam_image_export_jobs.ts";

function createMockClient(store: Record<string, Record<string, unknown>> = {}) {
  return {
    apps: {
      datastore: {
        get: (params: { datastore: string; id: string }) => {
          return Promise.resolve({
            ok: true,
            item: store[params.id],
          });
        },
        put: (
          params: { datastore: string; item: Record<string, unknown> },
        ) => {
          store[params.item.job_key as string] = params.item;
          return Promise.resolve({ ok: true });
        },
        delete: (params: { datastore: string; id: string }) => {
          delete store[params.id];
          return Promise.resolve({ ok: true });
        },
      },
    },
  };
}

function createErrorClient() {
  return {
    apps: {
      datastore: {
        get: (_params: { datastore: string; id: string }) => {
          return Promise.resolve({ ok: false, error: "read_error" });
        },
        put: (
          _params: { datastore: string; item: Record<string, unknown> },
        ) => {
          return Promise.resolve({ ok: false, error: "write_error" });
        },
        delete: (_params: { datastore: string; id: string }) => {
          return Promise.resolve({ ok: false, error: "delete_error" });
        },
      },
    },
  };
}

Deno.test("全台画像スナップショットジョブキーを生成できる", () => {
  assertEquals(
    buildAllSoraCamImageExportJobKey("C123"),
    "C123",
  );
});

Deno.test("全台画像スナップショットジョブを保存して再取得できる", async () => {
  const store: Record<string, Record<string, unknown>> = {};
  const client = createMockClient(store);

  await upsertAllSoraCamImageExportJob(client, {
    jobKey: "C123",
    channelId: "C123",
    messageTs: "1742281200.000100",
    totalDeviceCount: 4,
    claimId: "claim-1",
    status: "pending",
    createdAt: "2026-03-19T01:00:00.000Z",
    updatedAt: "2026-03-19T01:05:00.000Z",
  });

  const job = await getAllSoraCamImageExportJob(client, "C123");

  assertEquals(job, {
    jobKey: "C123",
    channelId: "C123",
    messageTs: "1742281200.000100",
    totalDeviceCount: 4,
    claimId: "claim-1",
    status: "pending",
    createdAt: "2026-03-19T01:00:00.000Z",
    updatedAt: "2026-03-19T01:05:00.000Z",
  });
});

Deno.test("不正な全台画像スナップショットジョブレコードは無視される", async () => {
  const client = createMockClient({
    C123: {
      job_key: "C123",
      channel_id: "C123",
      message_ts: "1742281200.000100",
      total_device_count: "broken",
      status: "pending",
      created_at: "2026-03-19T01:00:00.000Z",
      updated_at: "2026-03-19T01:05:00.000Z",
    },
  });

  const job = await getAllSoraCamImageExportJob(client, "C123");

  assertEquals(job, null);
});

Deno.test("全台画像スナップショットジョブの保存失敗時はエラーを返す", async () => {
  const client = createErrorClient();

  let message = "";
  try {
    await upsertAllSoraCamImageExportJob(client, {
      jobKey: "C123",
      channelId: "C123",
      messageTs: "1742281200.000100",
      totalDeviceCount: 0,
      status: "starting",
      createdAt: "2026-03-19T01:00:00.000Z",
      updatedAt: "2026-03-19T01:00:00.000Z",
    });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  assertEquals(message.length > 0, true);
});
