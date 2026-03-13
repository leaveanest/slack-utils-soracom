import { assertEquals } from "std/testing/asserts.ts";
import { formatSoraCamImageExportMessage } from "./mod.ts";
import type { SoraCamImageExport } from "../../lib/soracom/mod.ts";

Deno.test({
  name: "完了したエクスポートが正常にフォーマットされる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const exportResult: SoraCamImageExport = {
      exportId: "export-123",
      deviceId: "7C12345678AB",
      status: "completed",
      url: "https://example.com/image.jpg",
      requestedTime: 1700000000000,
      completedTime: 1700000005000,
    };

    const message = formatSoraCamImageExportMessage(
      "7C12345678AB",
      exportResult,
    );

    assertEquals(message.includes("7C12345678AB"), true);
    assertEquals(message.includes("completed"), true);
    assertEquals(message.includes("https://example.com/image.jpg"), true);
  },
});

Deno.test({
  name: "処理中のエクスポートが正常にフォーマットされる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const exportResult: SoraCamImageExport = {
      exportId: "export-456",
      deviceId: "7C12345678AB",
      status: "processing",
      url: "",
      requestedTime: 1700000000000,
      completedTime: 0,
    };

    const message = formatSoraCamImageExportMessage(
      "7C12345678AB",
      exportResult,
    );

    assertEquals(message.includes("7C12345678AB"), true);
    assertEquals(message.includes("processing"), true);
    assertEquals(message.includes("export-456"), true);
  },
});

Deno.test({
  name: "失敗したエクスポートが正常にフォーマットされる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const exportResult: SoraCamImageExport = {
      exportId: "export-789",
      deviceId: "7C12345678AB",
      status: "failed",
      url: "",
      requestedTime: 1700000000000,
      completedTime: 1700000010000,
    };

    const message = formatSoraCamImageExportMessage(
      "7C12345678AB",
      exportResult,
    );

    assertEquals(message.includes("failed"), true);
    // URLは表示されない
    assertEquals(message.includes("https://"), false);
  },
});
