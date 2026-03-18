import { assertEquals } from "std/testing/asserts.ts";
import { initI18n, setLocale } from "../../lib/i18n/mod.ts";
import {
  formatSoraCamBatchImageExportMessage,
  pickSoraCamSnapshotTime,
  type SoraCamBatchImageExportResult,
  summarizeSoraCamBatchImageExportResults,
} from "./mod.ts";

async function prepareLocale(locale: "en" | "ja" = "ja"): Promise<void> {
  await initI18n();
  setLocale(locale);
}

Deno.test("全台画像エクスポートの集計件数を状態ごとに算出できる", async () => {
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

Deno.test("全台画像エクスポートの結果メッセージに集計とアップロード結果が含まれる", async () => {
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

  assertEquals(message.includes("ソラカメ画像エクスポート (2台)"), true);
  assertEquals(message.includes("成功 1件 / 処理中 1件 / 失敗 0件"), true);
  assertEquals(message.includes("入口カメラ"), true);
  assertEquals(message.includes("デバイスID: cam-1"), true);
  assertEquals(message.includes("2026-03-18 16:05:41 JST"), true);
  assertEquals(
    message.includes("結果: Slack にスナップショットをアップロードしました"),
    true,
  );
  assertEquals(
    message.includes(
      "結果: 画像エクスポート処理中です（エクスポートID: exp-2）",
    ),
    true,
  );
  assertEquals(message.includes("uploaded"), false);
});

Deno.test("全台画像エクスポートの失敗結果にエラーメッセージが含まれる", async () => {
  await prepareLocale("ja");

  const results: SoraCamBatchImageExportResult[] = [
    {
      deviceId: "cam-3",
      deviceName: "Warehouse",
      exportId: "",
      status: "failed",
      imageUrl: "",
      errorMessage: "timeout",
    },
  ];

  const message = formatSoraCamBatchImageExportMessage(results);

  assertEquals(message.includes("Warehouse"), true);
  assertEquals(message.includes("結果: 画像エクスポートに失敗しました"), true);
  assertEquals(message.includes("詳細: timeout"), true);
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

  assertEquals(snapshotTime, 1700000640000);
});

Deno.test("進行中の録画区間があれば現在時刻に近いスナップショット時刻を選べる", async () => {
  await prepareLocale("ja");

  const now = 1700001000000;
  const snapshotTime = pickSoraCamSnapshotTime(
    [
      {
        startTime: 1700000000000,
        endTime: 1700000300000,
      },
      {
        startTime: 1700000400000,
      },
    ],
    60_000,
    now,
  );

  assertEquals(snapshotTime, 1700000940000);
});
