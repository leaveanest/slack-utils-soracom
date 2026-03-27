import { assertEquals } from "std/testing/asserts.ts";
import { stub } from "std/testing/mock.ts";
import { initI18n, setLocale } from "../../lib/i18n/mod.ts";
import { runWithImmediateRetry } from "../../lib/soracom/immediate_retry.ts";
import {
  buildAllSoraCamImageExportJobKey,
  buildAllSoraCamImageExportTaskKey,
  getAllSoraCamImageExportJob,
  getAllSoraCamImageExportTask,
  listAllSoraCamImageExportTasks,
  upsertAllSoraCamImageExportTask,
} from "../../lib/soracom/mod.ts";
import type {
  SoraCamDevice,
  SoraCamImageExport,
} from "../../lib/soracom/mod.ts";
import {
  ALL_SORACAM_EXPORT_PARALLELISM,
  ALL_SORACAM_EXPORT_STALE_UNSTARTED_TASK_MS,
  ALL_SORACAM_EXPORT_TRIGGER_DELAY_MS,
  formatAllSoraCamImageExportMessage,
  formatPendingAllSoraCamImageExportMessage,
  formatSoraCamBatchImageExportMessage,
  pickSoraCamSnapshotTime,
  processAllSoraCamImageExport,
  type SoraCamBatchImageExportResult,
  summarizeSoraCamBatchImageExportResults,
} from "./mod.ts";

async function prepareLocale(locale: "en" | "ja" = "ja"): Promise<void> {
  await initI18n();
  setLocale(locale);
}

function stubImmediateTimeout() {
  return stub(
    globalThis,
    "setTimeout",
    ((
      handler: (...args: unknown[]) => void,
      _timeout?: number,
      ...args: unknown[]
    ) => {
      handler(...args);
      return 0 as never;
    }) as unknown as typeof setTimeout,
  );
}

function createExportAllClient() {
  const posts: Array<{ channel: string; text: string }> = [];
  const updates: Array<{ channel: string; ts: string; text: string }> = [];
  const apiCalls: Array<{ method: string; body?: Record<string, unknown> }> =
    [];
  const triggerCreates: Array<Record<string, unknown>> = [];
  const datastores: Record<string, Record<string, Record<string, unknown>>> =
    {};
  let fileIdSeq = 0;
  let triggerIdSeq = 0;

  const ensureDatastore = (name: string) => {
    datastores[name] ??= {};
    return datastores[name];
  };

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
            trigger: { id: `Ft${triggerIdSeq}` },
          });
        },
      },
    },
    apps: {
      datastore: {
        get(params: { datastore: string; id: string }) {
          return Promise.resolve({
            ok: true,
            item: ensureDatastore(params.datastore)[params.id],
          });
        },
        put(params: { datastore: string; item: Record<string, unknown> }) {
          const datastore = ensureDatastore(params.datastore);
          const id = (params.item.task_key ?? params.item.job_key) as string;
          datastore[id] = params.item;
          return Promise.resolve({ ok: true });
        },
        query(params: { datastore: string }) {
          return Promise.resolve({
            ok: true,
            items: Object.values(ensureDatastore(params.datastore)),
          });
        },
        delete(params: { datastore: string; id: string }) {
          delete ensureDatastore(params.datastore)[params.id];
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
    triggerCreates,
    datastores,
  };
}

type ExportBehavior = SoraCamImageExport | Error;
type ExportBehaviorSequence = ExportBehavior | ExportBehavior[];

function buildExportResult(
  deviceId: string,
  status: string,
  exportId: string,
  url = "",
): SoraCamImageExport {
  return {
    exportId,
    deviceId,
    status,
    url,
    requestedTime: 1700000000000,
    completedTime: 1700000001000,
  };
}

function createDevices(count: number): SoraCamDevice[] {
  return Array.from({ length: count }, (_, index) => ({
    deviceId: `cam-${index + 1}`,
    name: `Camera ${index + 1}`,
    status: "online",
    firmwareVersion: "1.0.0",
    lastConnectedTime: 1700000000000,
  }));
}

function createSoracomClientMock(params: {
  devices: SoraCamDevice[];
  initialExports?: Record<string, ExportBehavior>;
  resumedExports?: Record<string, ExportBehaviorSequence>;
  recordingEndTime?: number;
}) {
  const listDeviceCalls: string[] = [];
  const listRecordingCalls: string[] = [];
  const exportCalls: string[] = [];
  const getExportCalls: Array<{ deviceId: string; exportId: string }> = [];
  const recordingEndTime = params.recordingEndTime ?? 1700000300000;

  const nextResumedBehavior = (
    deviceId: string,
  ): ExportBehavior | undefined => {
    const behavior = params.resumedExports?.[deviceId];

    if (Array.isArray(behavior)) {
      return behavior.shift();
    }

    return behavior;
  };

  const soracomClient = {
    listSoraCamDevices() {
      listDeviceCalls.push("list");
      return Promise.resolve(params.devices);
    },
    listSoraCamRecordingsAndEvents(deviceId: string) {
      listRecordingCalls.push(deviceId);
      return Promise.resolve({
        records: [
          {
            startTime: recordingEndTime - 60_000,
            endTime: recordingEndTime,
          },
        ],
        events: [],
      });
    },
    exportSoraCamImage(deviceId: string, _time: number) {
      exportCalls.push(deviceId);
      const behavior = params.initialExports?.[deviceId];
      if (!behavior) {
        throw new Error(`missing initial export for ${deviceId}`);
      }
      if (behavior instanceof Error) {
        throw behavior;
      }
      return Promise.resolve(behavior);
    },
    getSoraCamImageExport(deviceId: string, exportId: string) {
      getExportCalls.push({ deviceId, exportId });
      return runWithImmediateRetry(
        () => {
          const behavior = nextResumedBehavior(deviceId);
          if (!behavior) {
            throw new Error(`missing resumed export for ${deviceId}`);
          }
          if (behavior instanceof Error) {
            throw behavior;
          }
          return Promise.resolve({
            ...behavior,
            exportId: behavior.exportId || exportId,
          });
        },
        (error) => error instanceof TypeError,
      );
    },
  };

  return {
    soracomClient,
    listDeviceCalls,
    listRecordingCalls,
    exportCalls,
    getExportCalls,
  };
}

Deno.test("全台画像スナップショットの集計件数を状態ごとに算出できる", async () => {
  await prepareLocale("ja");

  const results: SoraCamBatchImageExportResult[] = [
    {
      deviceId: "cam-1",
      deviceName: "Entrance",
      exportId: "exp-1",
      status: "uploaded",
      imageUrl: "",
      snapshotTime: 1700000000000,
      slackFileId: "F123",
    },
    {
      deviceId: "cam-2",
      deviceName: "Office",
      exportId: "exp-2",
      status: "processing",
      imageUrl: "",
    },
    {
      deviceId: "cam-3",
      deviceName: "Warehouse",
      exportId: "",
      status: "failed",
      imageUrl: "",
      errorMessage: "timeout",
    },
  ];

  const summary = summarizeSoraCamBatchImageExportResults(results);

  assertEquals(summary.completed, 1);
  assertEquals(summary.processing, 1);
  assertEquals(summary.failed, 1);
});

Deno.test("全台画像スナップショットの結果メッセージに集計とアップロード結果が含まれる", async () => {
  await prepareLocale("ja");

  const results: SoraCamBatchImageExportResult[] = [
    {
      deviceId: "cam-1",
      deviceName: "入口カメラ",
      exportId: "exp-1",
      status: "uploaded",
      imageUrl: "",
      snapshotTime: Date.parse("2026-03-18T07:05:41.000Z"),
      slackFileId: "F123",
    },
    {
      deviceId: "cam-2",
      deviceName: "cam-2",
      exportId: "exp-2",
      status: "processing",
      imageUrl: "",
    },
  ];

  const message = formatSoraCamBatchImageExportMessage(results);

  assertEquals(
    message.includes("ソラカメ全台画像スナップショット (2台)"),
    true,
  );
  assertEquals(message.includes("成功 1件 / 処理中 1件 / 失敗 0件"), true);
  assertEquals(message.includes("入口カメラ"), true);
  assertEquals(message.includes("デバイスID: cam-1"), true);
  assertEquals(message.includes("2026-03-18 16:05:41 JST"), true);
  assertEquals(
    message.includes("結果: Slack にスナップショットをアップロードしました"),
    true,
  );
});

Deno.test("対象デバイスがない場合はデバイス未検出メッセージを返す", async () => {
  await prepareLocale("ja");

  const message = formatSoraCamBatchImageExportMessage([]);

  assertEquals(message, "ソラカメデバイスが見つかりません");
});

Deno.test("最新の録画区間から安全なスナップショット時刻を選べる", async () => {
  await prepareLocale("ja");

  const snapshotTime = pickSoraCamSnapshotTime([
    {
      startTime: 1700000000000,
      endTime: 1700000300000,
    },
    {
      startTime: 1700000400000,
      endTime: 1700000700000,
    },
  ]);

  assertEquals(snapshotTime, 1700000690000);
});

Deno.test("進捗メッセージに残台数と自動継続案内が含まれる", async () => {
  await prepareLocale("ja");

  const message = formatAllSoraCamImageExportMessage(8, 3, 2, 1, 4);

  assertEquals(message.includes("8台"), true);
  assertEquals(message.includes("アップロード済み 3台"), true);
  assertEquals(message.includes("処理中 2台"), true);
  assertEquals(message.includes("残り 4台"), true);
  assertEquals(message.includes("チャンネル"), true);
  assertEquals(message.includes("自動で続行"), true);
});

Deno.test("開始メッセージに今回バッチ台数が含まれる", async () => {
  await prepareLocale("ja");

  const message = formatPendingAllSoraCamImageExportMessage(8, 5);

  assertEquals(message.includes("8台"), true);
  assertEquals(message.includes("最大5台"), true);
  assertEquals(message.includes("チャンネル"), true);
});

Deno.test("親 run は全ソラカメ一覧取得後に最初の5台を並列起動する", async () => {
  await prepareLocale("ja");

  const devices = createDevices(6);
  const { client, posts, updates, triggerCreates } = createExportAllClient();
  const { soracomClient, listDeviceCalls } = createSoracomClientMock({
    devices,
  });

  const result = await processAllSoraCamImageExport({
    soracomClient,
    client: client as never,
    channelId: "C123",
    now: 1700000400000,
  });

  assertEquals(listDeviceCalls.length, 1);
  assertEquals(posts.length, 1);
  assertEquals(updates.length, 1);
  assertEquals(triggerCreates.length, ALL_SORACAM_EXPORT_PARALLELISM);
  assertEquals(result.deviceCount, 6);
  assertEquals(result.completedCount, 0);
  assertEquals(result.processingCount, 5);
  assertEquals(result.failedCount, 0);

  const job = await getAllSoraCamImageExportJob(client as never, "C123");
  const tasks = await listAllSoraCamImageExportTasks(
    client as never,
    buildAllSoraCamImageExportJobKey("C123"),
  );

  assertEquals(job?.status, "pending");
  assertEquals(job?.totalDeviceCount, 6);
  assertEquals(tasks.length, 6);
  assertEquals(
    tasks.filter((task) => task.status === "processing").length,
    ALL_SORACAM_EXPORT_PARALLELISM,
  );
  assertEquals(tasks.at(-1)?.status, "queued");
});

Deno.test("トリガー開始時刻は trigger 作成時点を基準に計算される", async () => {
  await prepareLocale("ja");

  const dateNowStub = stub(Date, "now", () => 1700000500000);

  try {
    const devices = createDevices(6);
    const { client, triggerCreates } = createExportAllClient();
    const { soracomClient } = createSoracomClientMock({
      devices,
    });

    await processAllSoraCamImageExport({
      soracomClient,
      client: client as never,
      channelId: "C123",
      now: 1700000400000,
    });

    assertEquals(triggerCreates.length, ALL_SORACAM_EXPORT_PARALLELISM);
    assertEquals(
      triggerCreates[0]?.schedule,
      {
        start_time: new Date(
          1700000500000 + ALL_SORACAM_EXPORT_TRIGGER_DELAY_MS,
        ).toISOString(),
        frequency: {
          type: "once",
        },
      },
    );
  } finally {
    dateNowStub.restore();
  }
});

Deno.test("子 run が即完了した台をアップロードしたら次の待機台を補充する", async () => {
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
    const devices = createDevices(6);
    const { client, apiCalls, triggerCreates } = createExportAllClient();
    const { soracomClient, exportCalls } = createSoracomClientMock({
      devices,
      initialExports: {
        "cam-1": buildExportResult(
          "cam-1",
          "completed",
          "exp-cam-1",
          "https://image.local/cam-1.jpg",
        ),
      },
    });

    await processAllSoraCamImageExport({
      soracomClient,
      client: client as never,
      channelId: "C123",
      now: 1700000400000,
    });

    await processAllSoraCamImageExport({
      soracomClient,
      client: client as never,
      channelId: "C123",
      jobKey: "C123",
      taskKey: buildAllSoraCamImageExportTaskKey("C123", "cam-1"),
      now: 1700000405000,
    });

    const result = await processAllSoraCamImageExport({
      soracomClient,
      client: client as never,
      channelId: "C123",
      jobKey: "C123",
      taskKey: buildAllSoraCamImageExportTaskKey("C123", "cam-1"),
      now: 1700000405000,
    });

    assertEquals(exportCalls, ["cam-1"]);
    assertEquals(triggerCreates.length, ALL_SORACAM_EXPORT_PARALLELISM + 1);
    assertEquals(result.completedCount, 1);
    assertEquals(result.processingCount, 5);
    assertEquals(result.failedCount, 0);

    const cam1 = await getAllSoraCamImageExportTask(
      client as never,
      "C123:cam-1",
    );
    const cam6 = await getAllSoraCamImageExportTask(
      client as never,
      "C123:cam-6",
    );

    assertEquals(cam1?.status, "uploaded");
    assertEquals(cam6?.status, "processing");
    assertEquals(
      apiCalls.find((call) => call.method === "files.completeUploadExternal")
        ?.body?.thread_ts,
      undefined,
    );
  } finally {
    fetchStub.restore();
  }
});

Deno.test("子 run がまだ processing の台は自分自身だけ再スケジュールする", async () => {
  await prepareLocale("ja");

  const devices = createDevices(6);
  const { client, triggerCreates } = createExportAllClient();
  const { soracomClient, exportCalls } = createSoracomClientMock({
    devices,
    initialExports: {
      "cam-1": buildExportResult("cam-1", "processing", "exp-cam-1"),
    },
  });

  await processAllSoraCamImageExport({
    soracomClient,
    client: client as never,
    channelId: "C123",
    now: 1700000400000,
  });

  const result = await processAllSoraCamImageExport({
    soracomClient,
    client: client as never,
    channelId: "C123",
    jobKey: "C123",
    taskKey: buildAllSoraCamImageExportTaskKey("C123", "cam-1"),
    now: 1700000405000,
  });

  assertEquals(exportCalls, ["cam-1"]);
  assertEquals(triggerCreates.length, ALL_SORACAM_EXPORT_PARALLELISM + 1);
  assertEquals(result.completedCount, 0);
  assertEquals(result.processingCount, 5);
  assertEquals(result.failedCount, 0);

  const cam1 = await getAllSoraCamImageExportTask(
    client as never,
    "C123:cam-1",
  );
  const cam6 = await getAllSoraCamImageExportTask(
    client as never,
    "C123:cam-6",
  );

  assertEquals(cam1?.status, "processing");
  assertEquals(cam1?.exportId, "exp-cam-1");
  assertEquals(cam6?.status, "queued");
});

Deno.test(
  "親 run は export_id がないまま止まった processing タスクを待機列に戻して再起動する",
  async () => {
    await prepareLocale("ja");

    const devices = createDevices(2);
    const { client, triggerCreates } = createExportAllClient();
    const { soracomClient } = createSoracomClientMock({
      devices,
    });

    await processAllSoraCamImageExport({
      soracomClient,
      client: client as never,
      channelId: "C123",
      now: 1700000400000,
    });

    for (const device of devices) {
      const taskKey = buildAllSoraCamImageExportTaskKey(
        "C123",
        device.deviceId,
      );
      const task = await getAllSoraCamImageExportTask(client as never, taskKey);
      if (!task) {
        throw new Error(`task not found: ${taskKey}`);
      }

      await upsertAllSoraCamImageExportTask(client as never, {
        ...task,
        updatedAt: new Date(
          1700000400000 - ALL_SORACAM_EXPORT_STALE_UNSTARTED_TASK_MS - 1,
        ).toISOString(),
      });
    }

    const result = await processAllSoraCamImageExport({
      soracomClient,
      client: client as never,
      channelId: "C123",
      now: 1700000400000,
    });

    const tasks = await listAllSoraCamImageExportTasks(client as never, "C123");

    assertEquals(triggerCreates.length, 4);
    assertEquals(result.completedCount, 0);
    assertEquals(result.processingCount, 2);
    assertEquals(result.failedCount, 0);
    assertEquals(tasks.every((task) => task.status === "processing"), true);
  },
);

Deno.test("子 run が失敗した台は failed にして次の待機台を補充する", async () => {
  await prepareLocale("ja");

  const devices = createDevices(6);
  const { client, triggerCreates } = createExportAllClient();
  const { soracomClient, exportCalls } = createSoracomClientMock({
    devices,
    initialExports: {
      "cam-1": buildExportResult("cam-1", "failed", "exp-cam-1"),
    },
  });

  await processAllSoraCamImageExport({
    soracomClient,
    client: client as never,
    channelId: "C123",
    now: 1700000400000,
  });

  const result = await processAllSoraCamImageExport({
    soracomClient,
    client: client as never,
    channelId: "C123",
    jobKey: "C123",
    taskKey: buildAllSoraCamImageExportTaskKey("C123", "cam-1"),
    now: 1700000405000,
  });

  assertEquals(exportCalls, ["cam-1"]);
  assertEquals(triggerCreates.length, ALL_SORACAM_EXPORT_PARALLELISM + 1);
  assertEquals(result.completedCount, 0);
  assertEquals(result.processingCount, 5);
  assertEquals(result.failedCount, 1);

  const cam1 = await getAllSoraCamImageExportTask(
    client as never,
    "C123:cam-1",
  );
  const cam6 = await getAllSoraCamImageExportTask(
    client as never,
    "C123:cam-6",
  );

  assertEquals(cam1?.status, "failed");
  assertEquals(cam6?.status, "processing");
});

Deno.test("子 run の export status 一時エラーは同一 run 内で回復できる", async () => {
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
  const setTimeoutStub = stubImmediateTimeout();

  try {
    const devices = createDevices(6);
    const { client, triggerCreates } = createExportAllClient();
    const { soracomClient, exportCalls, getExportCalls } =
      createSoracomClientMock({
        devices,
        resumedExports: {
          "cam-1": [
            new TypeError("temporary_network_error"),
            buildExportResult(
              "cam-1",
              "completed",
              "exp-cam-1",
              "https://image.local/cam-1.jpg",
            ),
          ],
        },
      });

    await processAllSoraCamImageExport({
      soracomClient,
      client: client as never,
      channelId: "C123",
      now: 1700000400000,
    });

    const cam1TaskBeforeResume = await getAllSoraCamImageExportTask(
      client as never,
      "C123:cam-1",
    );
    if (!cam1TaskBeforeResume) {
      throw new Error("cam-1 task not found");
    }

    await upsertAllSoraCamImageExportTask(client as never, {
      ...cam1TaskBeforeResume,
      exportId: "exp-cam-1",
      snapshotTime: 1700000290000,
      updatedAt: new Date(1700000404000).toISOString(),
    });

    const result = await processAllSoraCamImageExport({
      soracomClient,
      client: client as never,
      channelId: "C123",
      jobKey: "C123",
      taskKey: buildAllSoraCamImageExportTaskKey("C123", "cam-1"),
      now: 1700000405000,
    });

    const cam1 = await getAllSoraCamImageExportTask(
      client as never,
      "C123:cam-1",
    );
    const cam6 = await getAllSoraCamImageExportTask(
      client as never,
      "C123:cam-6",
    );

    assertEquals(exportCalls, []);
    assertEquals(getExportCalls.length, 1);
    assertEquals(triggerCreates.length, ALL_SORACAM_EXPORT_PARALLELISM + 1);
    assertEquals(result.completedCount, 1);
    assertEquals(result.processingCount, 5);
    assertEquals(result.failedCount, 0);
    assertEquals(cam1?.status, "uploaded");
    assertEquals(cam6?.status, "processing");
  } finally {
    fetchStub.restore();
    setTimeoutStub.restore();
  }
});

Deno.test("対象デバイスが0台のときはジョブを作らずメッセージだけ投稿する", async () => {
  await prepareLocale("ja");

  const { client, posts, updates, triggerCreates } = createExportAllClient();
  const { soracomClient } = createSoracomClientMock({
    devices: [],
  });

  const result = await processAllSoraCamImageExport({
    soracomClient,
    client: client as never,
    channelId: "C123",
    now: 1700000400000,
  });

  assertEquals(posts.length, 1);
  assertEquals(updates.length, 0);
  assertEquals(triggerCreates.length, 0);
  assertEquals(result.deviceCount, 0);
  assertEquals(result.message, "ソラカメデバイスが見つかりません");
  assertEquals(
    await getAllSoraCamImageExportJob(client as never, "C123"),
    null,
  );
});
