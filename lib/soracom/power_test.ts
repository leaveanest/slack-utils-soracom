import { assertEquals } from "std/testing/asserts.ts";
import type { HarvestDataEntry } from "./types.ts";
import { extractPowerSample, resolveLatestPowerSample } from "./power.ts";

function createEntry(
  time: number,
  content: unknown,
): HarvestDataEntry {
  return {
    time,
    content,
    contentType: "application/json",
  };
}

Deno.test("Harvest Dataエントリから電圧サンプルを抽出できる", () => {
  const sample = extractPowerSample(
    createEntry(1000, { voltage: 12.4 }),
  );

  assertEquals(sample, {
    time: 1000,
    kind: "voltage",
    key: "voltage",
    value: 12.4,
    unit: "V",
  });
});

Deno.test("数値文字列のバッテリー値を抽出できる", () => {
  const sample = extractPowerSample(
    createEntry(1000, { battery_level: "84" }),
  );

  assertEquals(sample, {
    time: 1000,
    kind: "battery",
    key: "battery_level",
    value: 84,
    unit: "%",
  });
});

Deno.test("bat キーの数値文字列をバッテリー値として抽出できる", () => {
  const sample = extractPowerSample(
    createEntry(1000, { bat: "91" }),
  );

  assertEquals(sample, {
    time: 1000,
    kind: "battery",
    key: "bat",
    value: 91,
    unit: "%",
  });
});

Deno.test("対象キーがあっても数値でなければ抽出しない", () => {
  const sample = extractPowerSample(
    createEntry(1000, { current: "unknown" }),
  );

  assertEquals(sample, null);
});

Deno.test("複数エントリから最新の有効な電力サンプルを返す", () => {
  const resolution = resolveLatestPowerSample([
    createEntry(1000, { battery_level: 40 }),
    createEntry(3000, { power: 25.5 }),
    createEntry(2000, { voltage: 12.1 }),
  ]);

  assertEquals(resolution, {
    status: "ok",
    sample: {
      time: 3000,
      kind: "power",
      key: "power",
      value: 25.5,
      unit: "W",
    },
  });
});

Deno.test("対象キーが壊れている場合は invalid_data を返す", () => {
  const resolution = resolveLatestPowerSample([
    createEntry(1000, { voltage: "n/a" }),
    createEntry(2000, { battery: "" }),
  ]);

  assertEquals(resolution, { status: "invalid_data" });
});

Deno.test("battery の状態値だけなら no_data を返す", () => {
  const resolution = resolveLatestPowerSample([
    createEntry(1000, { battery: "N" }),
    createEntry(2000, { battery: "L" }),
  ]);

  assertEquals(resolution, { status: "no_data" });
});

Deno.test("対象キー自体が無い場合は no_data を返す", () => {
  const resolution = resolveLatestPowerSample([
    createEntry(1000, { temperature: 20 }),
    createEntry(2000, { humidity: 45 }),
  ]);

  assertEquals(resolution, { status: "no_data" });
});
