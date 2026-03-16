import { assertEquals } from "std/testing/asserts.ts";
import type {
  AirQualitySpike,
  SoraCamImageExport,
} from "../../lib/soracom/mod.ts";
import { formatCo2SpikeWithSnapshotMessage } from "./mod.ts";

const spike: AirQualitySpike = {
  previousTime: Date.parse("2026-03-16T08:00:00.000Z"),
  currentTime: Date.parse("2026-03-16T08:05:00.000Z"),
  previousCo2: 820,
  currentCo2: 1180,
  delta: 360,
};

const completedExport: SoraCamImageExport = {
  exportId: "exp-1",
  deviceId: "dev-1",
  status: "completed",
  url: "https://example.com/snapshot.jpg",
  requestedTime: Date.parse("2026-03-16T08:05:00.000Z"),
  completedTime: Date.parse("2026-03-16T08:05:05.000Z"),
};

Deno.test({
  name: "CO2スパイクと画像URLを含むメッセージを生成できる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatCo2SpikeWithSnapshotMessage(
      "440101234567890",
      "dev-1",
      spike,
      completedExport,
      300,
    );

    assertEquals(message.includes("440101234567890"), true);
    assertEquals(message.includes("dev-1"), true);
    assertEquals(message.includes("+360"), true);
    assertEquals(message.includes("https://example.com/snapshot.jpg"), true);
  },
});

Deno.test({
  name: "スパイクが見つからない場合は空データ用メッセージを返す",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatCo2SpikeWithSnapshotMessage(
      "440101234567890",
      "dev-1",
      null,
      null,
      300,
    );

    assertEquals(message.includes("440101234567890"), true);
    assertEquals(message.length > 0, true);
  },
});

Deno.test({
  name: "しきい値未満のスパイクは通知のみで終わる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatCo2SpikeWithSnapshotMessage(
      "440101234567890",
      "dev-1",
      {
        ...spike,
        delta: 120,
        currentCo2: 940,
      },
      null,
      300,
    );

    assertEquals(message.includes("300"), true);
    assertEquals(message.includes("+120"), true);
  },
});
