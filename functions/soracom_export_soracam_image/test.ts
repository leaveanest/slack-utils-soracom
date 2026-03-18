import { assertEquals } from "std/testing/asserts.ts";
import { initI18n, setLocale } from "../../lib/i18n/mod.ts";
import {
  formatSoraCamImageExportMessage,
  type SoraCamSingleImageExportResult,
} from "./mod.ts";

async function prepareLocale(locale: "en" | "ja" = "ja"): Promise<void> {
  await initI18n();
  setLocale(locale);
}

Deno.test("単体画像エクスポートの成功メッセージが日本時間で整形される", async () => {
  await prepareLocale("ja");

  const result: SoraCamSingleImageExportResult = {
    deviceId: "7C12345678AB",
    deviceName: "テスト用カメラ",
    exportId: "export-123",
    status: "uploaded",
    imageUrl: "https://example.com/image.jpg",
    snapshotTime: Date.parse("2026-03-18T07:05:41.000Z"),
    slackFileId: "F123",
  };

  const message = formatSoraCamImageExportMessage(result);

  assertEquals(message.includes("ソラカメ画像エクスポート (1台)"), true);
  assertEquals(message.includes("成功 1件 / 失敗 0件"), true);
  assertEquals(message.includes("テスト用カメラ"), true);
  assertEquals(message.includes("デバイスID: 7C12345678AB"), true);
  assertEquals(message.includes("2026-03-18 16:05:41 JST"), true);
  assertEquals(
    message.includes("結果: Slack にスナップショットをアップロードしました"),
    true,
  );
  assertEquals(message.includes("uploaded"), false);
});

Deno.test("単体画像エクスポートの失敗メッセージに詳細が含まれる", async () => {
  await prepareLocale("ja");

  const result: SoraCamSingleImageExportResult = {
    deviceId: "7C12345678AB",
    deviceName: "テスト用カメラ",
    exportId: "export-789",
    status: "failed",
    imageUrl: "",
    errorMessage: "timeout",
  };

  const message = formatSoraCamImageExportMessage(result);

  assertEquals(message.includes("失敗 1件"), true);
  assertEquals(message.includes("結果: 画像エクスポートに失敗しました"), true);
  assertEquals(message.includes("詳細: timeout"), true);
});
