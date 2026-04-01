import { assertEquals } from "std/testing/asserts.ts";
import {
  buildAllSoraCamImageExportTaskKey,
  getAllSoraCamImageExportTask,
  listAllSoraCamImageExportTasks,
  upsertAllSoraCamImageExportTask,
} from "./all_soracam_image_export_tasks.ts";

type QueryPage = {
  cursor?: string;
  items: Array<Record<string, unknown>>;
  nextCursor?: string;
};

function createMockClient(
  store: Record<string, Record<string, unknown>> = {},
  options?: {
    queryPages?: QueryPage[];
  },
) {
  const queryPageMap = new Map(
    (options?.queryPages ?? []).map((
      page,
    ) => [page.cursor ?? "__first__", page]),
  );

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
          store[params.item.task_key as string] = params.item;
          return Promise.resolve({ ok: true });
        },
        query: (params: {
          datastore: string;
          cursor?: string;
          expression?: string;
          expression_attributes?: Record<string, string>;
          expression_values?: Record<string, unknown>;
          limit?: number;
        }) => {
          const queryPage = queryPageMap.get(params.cursor ?? "__first__");
          if (queryPage) {
            return Promise.resolve({
              ok: true,
              items: queryPage.items,
              ...(queryPage.nextCursor
                ? { response_metadata: { next_cursor: queryPage.nextCursor } }
                : {}),
            });
          }

          const jobKey = params.expression_values?.[":job_key"];
          return Promise.resolve({
            ok: true,
            items: Object.values(store).filter((item) =>
              typeof jobKey === "string" ? item.job_key === jobKey : true
            ),
          });
        },
        delete: (params: { datastore: string; id: string }) => {
          delete store[params.id];
          return Promise.resolve({ ok: true });
        },
      },
    },
  };
}

Deno.test("全台画像スナップショットタスクキーを生成できる", () => {
  assertEquals(
    buildAllSoraCamImageExportTaskKey("C123", "cam-1"),
    "C123:cam-1",
  );
});

Deno.test("全台画像スナップショットタスクを保存して一覧取得できる", async () => {
  const store: Record<string, Record<string, unknown>> = {};
  const client = createMockClient(store);

  await upsertAllSoraCamImageExportTask(client, {
    taskKey: "C123:cam-2",
    jobKey: "C123",
    channelId: "C123",
    deviceId: "cam-2",
    deviceName: "Office",
    sortIndex: 1,
    continuationTriggerId: "Ft123",
    exportId: "exp-2",
    status: "processing",
    imageUrl: "",
    snapshotTime: 1700000000000,
    createdAt: "2026-03-19T01:00:00.000Z",
    updatedAt: "2026-03-19T01:00:00.000Z",
  });
  await upsertAllSoraCamImageExportTask(client, {
    taskKey: "C123:cam-1",
    jobKey: "C123",
    channelId: "C123",
    deviceId: "cam-1",
    deviceName: "Entrance",
    sortIndex: 0,
    exportId: "",
    status: "queued",
    imageUrl: "",
    createdAt: "2026-03-19T01:00:00.000Z",
    updatedAt: "2026-03-19T01:00:00.000Z",
  });

  const task = await getAllSoraCamImageExportTask(client, "C123:cam-2");
  const tasks = await listAllSoraCamImageExportTasks(client, "C123");

  assertEquals(task?.deviceId, "cam-2");
  assertEquals(task?.continuationTriggerId, "Ft123");
  assertEquals(tasks.map((entry) => entry.deviceId), ["cam-1", "cam-2"]);
  assertEquals(tasks[1].status, "processing");
});

Deno.test("continuation trigger ID がない旧タスクレコードも読み込める", async () => {
  const client = createMockClient({
    "C123:cam-1": {
      task_key: "C123:cam-1",
      job_key: "C123",
      channel_id: "C123",
      device_id: "cam-1",
      device_name: "Entrance",
      sort_index: 0,
      export_id: "",
      status: "queued",
      image_url: "",
      created_at: "2026-03-19T01:00:00.000Z",
      updated_at: "2026-03-19T01:00:00.000Z",
    },
  });

  const task = await getAllSoraCamImageExportTask(client, "C123:cam-1");

  assertEquals(task?.deviceId, "cam-1");
  assertEquals(task?.continuationTriggerId, undefined);
});

Deno.test(
  "全台画像スナップショットタスク一覧はカーソルページングを最後までたどる",
  async () => {
    const client = createMockClient({}, {
      queryPages: [
        {
          items: [],
          nextCursor: "cursor-2",
        },
        {
          cursor: "cursor-2",
          items: [
            {
              task_key: "C123:cam-2",
              job_key: "C123",
              channel_id: "C123",
              device_id: "cam-2",
              device_name: "Office",
              sort_index: 1,
              export_id: "",
              status: "queued",
              image_url: "",
              created_at: "2026-03-19T01:00:00.000Z",
              updated_at: "2026-03-19T01:00:00.000Z",
            },
          ],
          nextCursor: "cursor-3",
        },
        {
          cursor: "cursor-3",
          items: [
            {
              task_key: "C123:cam-1",
              job_key: "C123",
              channel_id: "C123",
              device_id: "cam-1",
              device_name: "Entrance",
              sort_index: 0,
              export_id: "",
              status: "queued",
              image_url: "",
              created_at: "2026-03-19T01:00:00.000Z",
              updated_at: "2026-03-19T01:00:00.000Z",
            },
          ],
        },
      ],
    });

    const tasks = await listAllSoraCamImageExportTasks(client, "C123");

    assertEquals(tasks.map((entry) => entry.deviceId), ["cam-1", "cam-2"]);
  },
);
