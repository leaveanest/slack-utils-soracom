import type { HarvestDataEntry } from "./types.ts";

export type PowerMetricKind = "power" | "voltage" | "current" | "battery";

export type PowerSample = {
  time: number;
  kind: PowerMetricKind;
  key: string;
  value: number;
  unit: string;
};

export type PowerSampleResolution =
  | { status: "ok"; sample: PowerSample }
  | { status: "no_data" }
  | { status: "invalid_data" };

type PowerMetricDefinition = {
  kind: PowerMetricKind;
  unit: string;
  aliases: Array<{
    name: string;
    strict?: boolean;
  }>;
};

const POWER_METRIC_DEFINITIONS: readonly PowerMetricDefinition[] = [
  {
    kind: "power",
    unit: "W",
    aliases: [
      { name: "power" },
      { name: "power_w" },
      { name: "powerw" },
      { name: "watt" },
      { name: "watts" },
      { name: "wattage" },
    ],
  },
  {
    kind: "voltage",
    unit: "V",
    aliases: [
      { name: "voltage" },
      { name: "volt" },
      { name: "volts" },
      { name: "voltage_v" },
      { name: "voltagev" },
    ],
  },
  {
    kind: "current",
    unit: "A",
    aliases: [
      { name: "current" },
      { name: "amp" },
      { name: "amps" },
      { name: "ampere" },
      { name: "amperes" },
      { name: "current_a" },
      { name: "currenta" },
    ],
  },
  {
    kind: "battery",
    unit: "%",
    aliases: [
      { name: "battery", strict: false },
      { name: "bat", strict: false },
      { name: "battery_level" },
      { name: "batterylevel" },
      { name: "battery_percent" },
      { name: "batterypercent" },
      { name: "battery_pct" },
      { name: "batterypct" },
      { name: "battery_soc" },
      { name: "state_of_charge" },
    ],
  },
] as const;

/**
 * Harvest Dataエントリから電力系メトリクスを抽出します。
 *
 * @param entry - Harvest Dataエントリ
 * @returns 抽出したサンプル。対象キーがない、または数値化できない場合は `null`
 */
export function extractPowerSample(
  entry: HarvestDataEntry,
): PowerSample | null {
  return inspectPowerEntry(entry).sample;
}

/**
 * Harvest Data一覧から最新の電力系メトリクスを解決します。
 *
 * 優先順位:
 * 1. 期間内で最も新しい有効なサンプル
 * 2. 対象キーはあるが全て壊れている場合は `invalid_data`
 * 3. 対象キー自体が見つからない場合は `no_data`
 *
 * @param entries - Harvest Dataエントリ一覧
 * @returns 最新サンプル、またはデータ状態
 */
export function resolveLatestPowerSample(
  entries: HarvestDataEntry[],
): PowerSampleResolution {
  const sortedEntries = [...entries]
    .filter((entry) => Number.isFinite(entry.time))
    .sort((a, b) => b.time - a.time);

  let sawRecognizedKey = false;

  for (const entry of sortedEntries) {
    const inspection = inspectPowerEntry(entry);
    if (inspection.sample !== null) {
      return { status: "ok", sample: inspection.sample };
    }

    if (inspection.sawStrictAlias) {
      sawRecognizedKey = true;
    }
  }

  return sawRecognizedKey ? { status: "invalid_data" } : { status: "no_data" };
}

function inspectPowerEntry(
  entry: HarvestDataEntry,
): { sample: PowerSample | null; sawStrictAlias: boolean } {
  if (!Number.isFinite(entry.time) || !isRecord(entry.content)) {
    return { sample: null, sawStrictAlias: false };
  }

  const content = createCaseInsensitiveContentMap(entry.content);
  let sawStrictAlias = false;

  for (const definition of POWER_METRIC_DEFINITIONS) {
    for (const alias of definition.aliases) {
      if (!content.has(alias.name)) {
        continue;
      }

      const value = parseNumericValue(content.get(alias.name));
      if (value === undefined) {
        if (alias.strict !== false) {
          sawStrictAlias = true;
        }
        continue;
      }

      return {
        sample: {
          time: entry.time,
          kind: definition.kind,
          key: alias.name,
          value,
          unit: definition.unit,
        },
        sawStrictAlias,
      };
    }
  }

  return { sample: null, sawStrictAlias };
}

function createCaseInsensitiveContentMap(
  content: Record<string, unknown>,
): Map<string, unknown> {
  return new Map(
    Object.entries(content).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

function parseNumericValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
