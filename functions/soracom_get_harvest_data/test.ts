import { assertEquals } from "std/testing/asserts.ts";
import { formatHarvestDataMessage } from "./mod.ts";
import type { HarvestDataEntry } from "../../lib/soracom/mod.ts";

Deno.test({
  name: "Harvestデータが正常にフォーマットされる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const entries: HarvestDataEntry[] = [
      {
        time: 1700000000000,
        content: { temperature: 25.5, humidity: 60 },
        contentType: "application/json",
      },
      {
        time: 1700003600000,
        content: { temperature: 26.0, humidity: 58 },
        contentType: "application/json",
      },
    ];

    const message = formatHarvestDataMessage("440101234567890", entries);

    assertEquals(message.includes("440101234567890"), true);
    assertEquals(message.includes("temperature"), true);
  },
});

Deno.test({
  name: "Harvestデータが空の場合は適切なメッセージを返す",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatHarvestDataMessage("440101234567890", []);
    assertEquals(message.length > 0, true);
  },
});

Deno.test({
  name: "20件を超えるデータは最初の20件のみ表示される",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const entries: HarvestDataEntry[] = Array.from({ length: 25 }, (_, i) => ({
      time: 1700000000000 + i * 3600000,
      content: { value: i },
      contentType: "application/json",
    }));

    const message = formatHarvestDataMessage("440101234567890", entries);

    // 25件のうち20件のみ表示
    assertEquals(message.includes("25"), true); // ヘッダーには総数が表示
    const lines = message.split("\n").filter((l) => l.includes('"value"'));
    assertEquals(lines.length, 20);
  },
});
