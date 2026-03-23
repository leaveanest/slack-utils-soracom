import { assertEquals } from "std/testing/asserts.ts";
import { stub } from "std/testing/mock.ts";
import { initI18n, setLocale } from "../../lib/i18n/mod.ts";
import { getMotionCaptureJob } from "../../lib/soracom/mod.ts";
import type { SoraCamEvent } from "../../lib/soracom/mod.ts";
import {
  filterMotionEvents,
  formatMotionCaptureMessage,
  formatPendingMotionCaptureMessage,
  MOTION_CAPTURE_BATCH_SIZE,
  MOTION_CAPTURE_TIME_BUDGET_MS,
  processMotionCaptureBatch,
} from "./mod.ts";

async function prepareLocale(locale: "en" | "ja" = "ja"): Promise<void> {
  await initI18n();
  setLocale(locale);
}

function createMotionCaptureClient(
  store: Record<string, Record<string, unknown>> = {},
) {
  const posts: Array<{ channel: string; text: string }> = [];
  const updates: Array<{ channel: string; ts: string; text: string }> = [];
  const apiCalls: Array<{ method: string; body?: Record<string, unknown> }> =
    [];
  const triggerCreates: Array<Record<string, unknown>> = [];
  const triggerDeletes: string[] = [];
  let fileIdSeq = 0;
  let triggerIdSeq = 0;

  const client = {
    apiCall(method: string, body?: Record<string, unknown>) {
      apiCalls.push({ method, body });

      if (method === "files.getUploadURLExternal") {
        fileIdSeq += 1;
        return Promise.resolve({
          ok: true,
          upload_url: "https://upload.local/files",
          file_id: `F${fileIdSeq}`,
        });
      }

      if (method === "files.completeUploadExternal") {
        const files = body?.files as Array<{ id: string }>;
        return Promise.resolve({
          ok: true,
          files: [{ id: files[0].id }],
        });
      }

      throw new Error(`unexpected apiCall: ${method}`);
    },
    workflows: {
      triggers: {
        create(body: Record<string, unknown>) {
          triggerCreates.push(body);
          triggerIdSeq += 1;
          return Promise.resolve({
            ok: true,
            trigger: {
              id: `Ft${triggerIdSeq}`,
            },
          });
        },
        delete(params: { trigger_id: string }) {
          triggerDeletes.push(params.trigger_id);
          return Promise.resolve({ ok: true });
        },
      },
    },
    apps: {
      datastore: {
        get(params: { datastore: string; id: string }) {
          return Promise.resolve({
            ok: true,
            item: store[params.id],
          });
        },
        put(params: { datastore: string; item: Record<string, unknown> }) {
          store[params.item.job_key as string] = params.item;
          return Promise.resolve({ ok: true });
        },
        delete(params: { datastore: string; id: string }) {
          delete store[params.id];
          return Promise.resolve({ ok: true });
        },
      },
    },
    chat: {
      postMessage(params: { channel: string; text: string }) {
        posts.push(params);
        return Promise.resolve({
          ok: true,
          ts: "1742281200.000100",
        });
      },
      update(params: { channel: string; ts: string; text: string }) {
        updates.push(params);
        return Promise.resolve({ ok: true });
      },
    },
  };

  return {
    client,
    posts,
    updates,
    apiCalls,
    store,
    triggerCreates,
    triggerDeletes,
  };
}

function createSoracomClientMock(
  eventTimes: number[],
  failedEventTimes: number[] = [],
) {
  const getEventsCalls: Array<{ deviceId: string; from: number; to: number }> =
    [];
  const exportCalls: number[] = [];
  const failures = new Set(failedEventTimes);

  const soracomClient = {
    getSoraCamEvents(deviceId: string, from: number, to: number) {
      getEventsCalls.push({ deviceId, from, to });
      const events: SoraCamEvent[] = eventTimes.map((eventTime) => ({
        deviceId,
        eventType: "motion",
        eventTime,
        eventInfo: {},
      }));
      return Promise.resolve(events);
    },
    exportSoraCamImage(deviceId: string, time: number) {
      exportCalls.push(time);
      if (failures.has(time)) {
        return Promise.reject(new Error("export_failed"));
      }

      return Promise.resolve({
        exportId: `exp-${time}`,
        deviceId,
        status: "completed",
        url: `https://image.local/${time}.jpg`,
        requestedTime: time,
        completedTime: time + 1000,
      });
    },
    getSoraCamImageExport(deviceId: string, exportId: string) {
      return Promise.resolve({
        exportId,
        deviceId,
        status: "completed",
        url: `https://image.local/${exportId.replace("exp-", "")}.jpg`,
        requestedTime: 0,
        completedTime: 0,
      });
    },
  };

  return { soracomClient, getEventsCalls, exportCalls };
}

Deno.test("モーションイベントが正しくフィルタされる", async () => {
  await prepareLocale("ja");

  const events: SoraCamEvent[] = [
    {
      deviceId: "dev-1",
      eventType: "motion",
      eventTime: 1700000000000,
      eventInfo: {},
    },
    {
      deviceId: "dev-1",
      eventType: "sound",
      eventTime: 1700001000000,
      eventInfo: {},
    },
    {
      deviceId: "dev-1",
      eventType: "person",
      eventTime: 1700002000000,
      eventInfo: {},
    },
  ];

  const motionEvents = filterMotionEvents(events);

  assertEquals(motionEvents.length, 2);
  assertEquals(motionEvents[0].eventType, "motion");
  assertEquals(motionEvents[1].eventType, "person");
});

Deno.test("進捗メッセージに残件と再開案内が含まれる", async () => {
  await prepareLocale("ja");

  const message = formatMotionCaptureMessage("dev-1", 8, 5, 1, 2);

  assertEquals(message.includes("8件"), true);
  assertEquals(message.includes("5枚"), true);
  assertEquals(message.includes("残り 2枚"), true);
  assertEquals(message.includes("自動で続行"), true);
});

Deno.test("アップロード開始メッセージに今回バッチ件数が含まれる", async () => {
  await prepareLocale("ja");

  const message = formatPendingMotionCaptureMessage("dev-1", 8, 5);

  assertEquals(message.includes("8件"), true);
  assertEquals(message.includes("最大5枚"), true);
});

Deno.test("新規ジョブ作成時に親メッセージを1回だけ投稿し最初の5件だけ処理する", async () => {
  await prepareLocale("ja");

  const fetchStub = stub(
    globalThis,
    "fetch",
    (input: string | URL | Request) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

      if (url === "https://upload.local/files") {
        return Promise.resolve(new Response(null, { status: 200 }));
      }

      if (url.startsWith("https://image.local/")) {
        return Promise.resolve(
          new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
        );
      }

      throw new Error(`unexpected fetch: ${url}`);
    },
  );

  try {
    const store: Record<string, Record<string, unknown>> = {};
    const {
      client,
      posts,
      updates,
      apiCalls,
      triggerCreates,
    } = createMotionCaptureClient(
      store,
    );
    const { soracomClient } = createSoracomClientMock([
      1700006000000,
      1700005000000,
      1700004000000,
      1700003000000,
      1700002000000,
      1700001000000,
    ]);

    const result = await processMotionCaptureBatch({
      client,
      soracomClient,
      channelId: "C123",
      deviceId: "dev-1",
      now: 1700007000000,
    });

    const job = await getMotionCaptureJob(client, "C123", "dev-1");

    assertEquals(posts.length, 1);
    assertEquals(updates.length, 1);
    assertEquals(
      apiCalls.filter((call) => call.method === "files.completeUploadExternal")
        .length,
      MOTION_CAPTURE_BATCH_SIZE,
    );
    assertEquals(result.eventCount, 6);
    assertEquals(result.exportedImages, 5);
    assertEquals(result.message.includes("残り 1枚"), true);
    assertEquals(triggerCreates.length, 1);
    assertEquals(job?.nextIndex, 5);
    assertEquals(job?.uploadedCount, 5);
    assertEquals(job?.failedCount, 0);
    assertEquals(job?.continuationTriggerId, "Ft1");
    assertEquals(job?.status, "pending");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("未完了ジョブ再実行時に親メッセージを再作成せず続きから再開する", async () => {
  await prepareLocale("ja");

  const fetchStub = stub(
    globalThis,
    "fetch",
    (input: string | URL | Request) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

      if (url === "https://upload.local/files") {
        return Promise.resolve(new Response(null, { status: 200 }));
      }

      if (url.startsWith("https://image.local/")) {
        return Promise.resolve(
          new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
        );
      }

      throw new Error(`unexpected fetch: ${url}`);
    },
  );

  try {
    const store: Record<string, Record<string, unknown>> = {};
    const firstRun = createMotionCaptureClient(store);
    const firstSoracom = createSoracomClientMock([
      1700006000000,
      1700005000000,
      1700004000000,
      1700003000000,
      1700002000000,
      1700001000000,
    ]);

    await processMotionCaptureBatch({
      client: firstRun.client,
      soracomClient: firstSoracom.soracomClient,
      channelId: "C123",
      deviceId: "dev-1",
      now: 1700007000000,
    });

    const secondRun = createMotionCaptureClient(store);
    const secondSoracom = createSoracomClientMock([]);
    const result = await processMotionCaptureBatch({
      client: secondRun.client,
      soracomClient: secondSoracom.soracomClient,
      channelId: "C123",
      deviceId: "dev-1",
      now: 1700008000000,
    });

    const job = await getMotionCaptureJob(secondRun.client, "C123", "dev-1");

    assertEquals(secondRun.posts.length, 0);
    assertEquals(secondRun.updates.length, 1);
    assertEquals(secondRun.triggerDeletes, ["Ft1"]);
    assertEquals(secondRun.triggerCreates.length, 0);
    assertEquals(
      secondRun.apiCalls.filter((call) =>
        call.method === "files.completeUploadExternal"
      ).length,
      1,
    );
    assertEquals(secondSoracom.getEventsCalls.length, 0);
    assertEquals(result.exportedImages, 6);
    assertEquals(job?.nextIndex, 6);
    assertEquals(job?.uploadedCount, 6);
    assertEquals(job?.continuationTriggerId, undefined);
    assertEquals(job?.status, "completed");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("1イベント失敗でも次へ進み累計失敗数を更新する", async () => {
  await prepareLocale("ja");

  const fetchStub = stub(
    globalThis,
    "fetch",
    (input: string | URL | Request) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

      if (url === "https://upload.local/files") {
        return Promise.resolve(new Response(null, { status: 200 }));
      }

      if (url.startsWith("https://image.local/")) {
        return Promise.resolve(
          new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
        );
      }

      throw new Error(`unexpected fetch: ${url}`);
    },
  );

  try {
    const { client } = createMotionCaptureClient();
    const { soracomClient } = createSoracomClientMock(
      [1700003000000, 1700002000000, 1700001000000],
      [1700002000000],
    );

    const result = await processMotionCaptureBatch({
      client,
      soracomClient,
      channelId: "C123",
      deviceId: "dev-1",
      now: 1700007000000,
    });

    const job = await getMotionCaptureJob(client, "C123", "dev-1");

    assertEquals(result.exportedImages, 2);
    assertEquals(result.message.includes("失敗 1枚"), true);
    assertEquals(job?.uploadedCount, 2);
    assertEquals(job?.failedCount, 1);
    assertEquals(job?.status, "completed");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("イベントがない場合は Datastore を作らず検出なしメッセージを返す", async () => {
  await prepareLocale("ja");

  const store: Record<string, Record<string, unknown>> = {};
  const { client, posts, updates } = createMotionCaptureClient(store);
  const { soracomClient } = createSoracomClientMock([]);

  const result = await processMotionCaptureBatch({
    client,
    soracomClient,
    channelId: "C123",
    deviceId: "dev-1",
    now: 1700007000000,
  });

  assertEquals(result.eventCount, 0);
  assertEquals(result.exportedImages, 0);
  assertEquals(posts.length, 1);
  assertEquals(updates.length, 0);
  assertEquals(Object.keys(store).length, 0);
});

Deno.test("初期化中ジョブを見た後続 run は親メッセージを増やさず準備完了を待つ", async () => {
  await prepareLocale("ja");

  const fetchStub = stub(
    globalThis,
    "fetch",
    (input: string | URL | Request) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

      if (url === "https://upload.local/files") {
        return Promise.resolve(new Response(null, { status: 200 }));
      }

      if (url.startsWith("https://image.local/")) {
        return Promise.resolve(
          new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
        );
      }

      throw new Error(`unexpected fetch: ${url}`);
    },
  );

  try {
    const store: Record<string, Record<string, unknown>> = {
      "C123:dev-1": {
        job_key: "C123:dev-1",
        channel_id: "C123",
        device_id: "dev-1",
        thread_ts: "__pending__",
        window_start_ms: 0,
        window_end_ms: 0,
        event_times_json: "[]",
        next_index: 0,
        total_event_count: 0,
        uploaded_count: 0,
        failed_count: 0,
        claim_id: "claim-1",
        status: "starting",
        created_at: "2026-03-18T10:00:00.000Z",
        updated_at: "2026-03-18T10:00:00.000Z",
      },
    };
    const { client, posts, updates, apiCalls } = createMotionCaptureClient(
      store,
    );
    let getCount = 0;
    const originalGet = client.apps.datastore.get;
    client.apps.datastore.get = (params: { datastore: string; id: string }) => {
      getCount += 1;
      if (getCount === 2) {
        store["C123:dev-1"] = {
          job_key: "C123:dev-1",
          channel_id: "C123",
          device_id: "dev-1",
          thread_ts: "1742281200.000100",
          window_start_ms: 1700000000000,
          window_end_ms: 1700003600000,
          event_times_json: "[1700003000000,1700002000000]",
          next_index: 0,
          total_event_count: 2,
          uploaded_count: 0,
          failed_count: 0,
          status: "pending",
          created_at: "2026-03-18T10:00:00.000Z",
          updated_at: "2026-03-18T10:00:01.000Z",
        };
      }
      return originalGet(params);
    };

    const { soracomClient, getEventsCalls } = createSoracomClientMock([]);
    const result = await processMotionCaptureBatch({
      client,
      soracomClient,
      channelId: "C123",
      deviceId: "dev-1",
      now: 1700007000000,
      delayFn: () => Promise.resolve(),
    });

    const job = await getMotionCaptureJob(client, "C123", "dev-1");

    assertEquals(posts.length, 0);
    assertEquals(updates.length, 1);
    assertEquals(getEventsCalls.length, 0);
    assertEquals(
      apiCalls.filter((call) => call.method === "files.completeUploadExternal")
        .length,
      2,
    );
    assertEquals(result.exportedImages, 2);
    assertEquals(job?.nextIndex, 2);
    assertEquals(job?.status, "completed");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("時間予算に達したら5件未満でもその run を終了して次回再開に回す", async () => {
  await prepareLocale("ja");

  const fetchStub = stub(
    globalThis,
    "fetch",
    (input: string | URL | Request) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

      if (url === "https://upload.local/files") {
        return Promise.resolve(new Response(null, { status: 200 }));
      }

      if (url.startsWith("https://image.local/")) {
        return Promise.resolve(
          new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
        );
      }

      throw new Error(`unexpected fetch: ${url}`);
    },
  );

  try {
    const store: Record<string, Record<string, unknown>> = {};
    const { client, triggerCreates } = createMotionCaptureClient(store);
    const { soracomClient, exportCalls } = createSoracomClientMock([
      1700006000000,
      1700005000000,
      1700004000000,
      1700003000000,
      1700002000000,
      1700001000000,
    ]);
    const times = [
      1700007000000,
      1700007000000 + 2000,
      1700007000000 + 51000,
    ];
    let timeIndex = 0;

    const result = await processMotionCaptureBatch({
      client,
      soracomClient,
      channelId: "C123",
      deviceId: "dev-1",
      now: 1700007000000,
      nowFn: () => times[Math.min(timeIndex++, times.length - 1)],
    });

    const job = await getMotionCaptureJob(client, "C123", "dev-1");

    assertEquals(MOTION_CAPTURE_TIME_BUDGET_MS, 50000);
    assertEquals(exportCalls.length, 2);
    assertEquals(result.eventCount, 6);
    assertEquals(result.exportedImages, 2);
    assertEquals(result.message.includes("残り 4枚"), true);
    assertEquals(triggerCreates.length, 1);
    assertEquals(job?.nextIndex, 2);
    assertEquals(job?.uploadedCount, 2);
    assertEquals(job?.continuationTriggerId, "Ft1");
    assertEquals(job?.status, "pending");
  } finally {
    fetchStub.restore();
  }
});
