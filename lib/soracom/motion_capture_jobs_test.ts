import { assertEquals } from "std/testing/asserts.ts";
import {
  buildMotionCaptureJobKey,
  getMotionCaptureJob,
  upsertMotionCaptureJob,
} from "./motion_capture_jobs.ts";

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

Deno.test("動体検知ジョブキーを生成できる", () => {
  assertEquals(
    buildMotionCaptureJobKey("C123", "dev-1"),
    "C123:dev-1",
  );
});

Deno.test("動体検知ジョブを保存して再取得できる", async () => {
  const store: Record<string, Record<string, unknown>> = {};
  const client = createMockClient(store);

  await upsertMotionCaptureJob(client, {
    jobKey: "C123:dev-1",
    channelId: "C123",
    deviceId: "dev-1",
    threadTs: "1742281200.000100",
    windowStartMs: 1700000000000,
    windowEndMs: 1700003600000,
    eventTimes: [1700003500000, 1700002500000],
    nextIndex: 1,
    totalEventCount: 2,
    uploadedCount: 1,
    failedCount: 0,
    claimId: "claim-1",
    continuationTriggerId: "Ft123",
    status: "pending",
    createdAt: "2026-03-18T10:00:00.000Z",
    updatedAt: "2026-03-18T10:05:00.000Z",
  });

  const job = await getMotionCaptureJob(client, "C123", "dev-1");

  assertEquals(job, {
    jobKey: "C123:dev-1",
    channelId: "C123",
    deviceId: "dev-1",
    threadTs: "1742281200.000100",
    windowStartMs: 1700000000000,
    windowEndMs: 1700003600000,
    eventTimes: [1700003500000, 1700002500000],
    nextIndex: 1,
    totalEventCount: 2,
    uploadedCount: 1,
    failedCount: 0,
    claimId: "claim-1",
    continuationTriggerId: "Ft123",
    status: "pending",
    createdAt: "2026-03-18T10:00:00.000Z",
    updatedAt: "2026-03-18T10:05:00.000Z",
  });
});

Deno.test("不正なジョブレコードは無視される", async () => {
  const client = createMockClient({
    "C123:dev-1": {
      job_key: "C123:dev-1",
      channel_id: "C123",
      device_id: "dev-1",
      thread_ts: "1742281200.000100",
      window_start_ms: 1700000000000,
      window_end_ms: 1700003600000,
      event_times_json: "{broken",
      next_index: 1,
      total_event_count: 2,
      uploaded_count: 1,
      failed_count: 0,
      status: "pending",
      created_at: "2026-03-18T10:00:00.000Z",
      updated_at: "2026-03-18T10:05:00.000Z",
    },
  });

  const job = await getMotionCaptureJob(client, "C123", "dev-1");

  assertEquals(job, null);
});

Deno.test("動体検知ジョブの保存失敗時はエラーを返す", async () => {
  const client = createErrorClient();

  let message = "";
  try {
    await upsertMotionCaptureJob(client, {
      jobKey: "C123:dev-1",
      channelId: "C123",
      deviceId: "dev-1",
      threadTs: "1742281200.000100",
      windowStartMs: 1700000000000,
      windowEndMs: 1700003600000,
      eventTimes: [1700003500000],
      nextIndex: 0,
      totalEventCount: 1,
      uploadedCount: 0,
      failedCount: 0,
      status: "pending",
      createdAt: "2026-03-18T10:00:00.000Z",
      updatedAt: "2026-03-18T10:00:00.000Z",
    });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  assertEquals(message.length > 0, true);
});
