import { assertEquals } from "std/testing/asserts.ts";
import type { SoraCamImageExport } from "../../lib/soracom/mod.ts";
import { formatVentilationCheckWithCameraMessage } from "./mod.ts";

const baseReviewMessage =
  "*Ventilation review*\nCO2 improved after ventilation";

const completedExport: SoraCamImageExport = {
  exportId: "exp-1",
  deviceId: "dev-1",
  status: "completed",
  url: "https://example.com/camera.jpg",
  requestedTime: Date.parse("2026-03-16T09:00:00.000Z"),
  completedTime: Date.parse("2026-03-16T09:00:05.000Z"),
};

Deno.test({
  name: "換気確認メッセージに画像URLを付加できる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatVentilationCheckWithCameraMessage(
      baseReviewMessage,
      "dev-1",
      Date.parse("2026-03-16T09:00:00.000Z"),
      completedExport,
    );

    assertEquals(message.includes("Ventilation review"), true);
    assertEquals(message.includes("dev-1"), true);
    assertEquals(message.includes("https://example.com/camera.jpg"), true);
  },
});

Deno.test({
  name: "画像が未取得の場合は未取得メッセージを返す",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatVentilationCheckWithCameraMessage(
      baseReviewMessage,
      "dev-1",
      Date.parse("2026-03-16T09:00:00.000Z"),
      null,
    );

    assertEquals(message.includes("dev-1"), true);
    assertEquals(message.length > 0, true);
  },
});

Deno.test({
  name: "画像処理中の場合は processing メッセージを返す",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatVentilationCheckWithCameraMessage(
      baseReviewMessage,
      "dev-1",
      Date.parse("2026-03-16T09:00:00.000Z"),
      {
        ...completedExport,
        status: "processing",
        url: "",
      },
    );

    assertEquals(message.includes("exp-1"), true);
  },
});
