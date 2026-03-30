import { assertEquals } from "std/testing/asserts.ts";
import type { HarvestDataEntry } from "./types.ts";
import {
  bucketAirQualityEntries,
  calculateDiscomfortIndex,
  compareAirQualitySummaries,
  DEFAULT_AIR_QUALITY_CRITERIA,
  extractAirQualitySample,
  filterAirQualityEntriesByTimeRange,
  findLargestCo2Spike,
  findPeakCo2Bucket,
  resolveAirQualityCriteria,
  summarizeAirQualityEntries,
} from "./air_quality.ts";

function createEntry(
  time: number,
  content: Record<string, unknown>,
): HarvestDataEntry {
  return {
    time,
    content,
    contentType: "application/json",
  };
}

Deno.test("Harvest Dataエントリから空気品質サンプルを抽出できる", () => {
  const sample = extractAirQualitySample(
    createEntry(1700000000000, {
      co2: 810,
      temperature: 24.5,
      humidity: 55,
    }),
  );

  assertEquals(sample, {
    time: 1700000000000,
    co2: 810,
    temperature: 24.5,
    humidity: 55,
  });
});

Deno.test("エイリアスキーと数値文字列から空気品質サンプルを抽出できる", () => {
  const sample = extractAirQualitySample(
    createEntry(1700003600000, {
      CO2_PPM: "950",
      temp: "23.25",
      humid: 48,
    }),
  );

  assertEquals(sample, {
    time: 1700003600000,
    co2: 950,
    temperature: 23.25,
    humidity: 48,
  });
});

Deno.test("対象メトリクスがないまたは無効なエントリは null を返す", () => {
  const noMetrics = extractAirQualitySample(
    createEntry(1700000000000, { pressure: 1013 }),
  );
  const invalidMetrics = extractAirQualitySample(
    createEntry(1700000000000, { co2: "not-a-number", temp: null }),
  );
  const invalidShape = extractAirQualitySample({
    time: Number.NaN,
    content: null as unknown as Record<string, unknown>,
    contentType: "application/json",
  });

  assertEquals(noMetrics, null);
  assertEquals(invalidMetrics, null);
  assertEquals(invalidShape, null);
});

Deno.test("Harvest Dataエントリを集計してメトリクス要約を返す", () => {
  const summary = summarizeAirQualityEntries([
    createEntry(3000, { co2ppm: 900, temperature: 23, humidity: 45 }),
    createEntry(1000, { co2: 700, temp: 21 }),
    createEntry(2000, { humidity: 50 }),
    createEntry(4000, { other: "ignored" }),
  ]);

  assertEquals(summary, {
    sampleCount: 3,
    co2: {
      latest: 900,
      min: 700,
      max: 900,
      average: 800,
    },
    temperature: {
      latest: 23,
      min: 21,
      max: 23,
      average: 22,
    },
    humidity: {
      latest: 45,
      min: 45,
      max: 50,
      average: 47.5,
    },
    discomfortIndex: {
      latest: 68.7415,
      min: 68.7415,
      max: 68.7415,
      average: 68.7415,
    },
    criteria: DEFAULT_AIR_QUALITY_CRITERIA,
    co2Threshold: 1000,
    co2ThresholdExceededCount: 0,
    temperatureRange: { min: 18, max: 28 },
    temperatureOutOfRangeCount: 0,
    humidityRange: { min: 40, max: 70 },
    humidityOutOfRangeCount: 0,
  });
});

Deno.test("CO2しきい値超過件数をカウントできる", () => {
  const summary = summarizeAirQualityEntries(
    [
      createEntry(1000, { co2: 900 }),
      createEntry(2000, { co2_ppm: 1000 }),
      createEntry(3000, { co2ppm: 1200 }),
      createEntry(4000, { co2: 1400 }),
    ],
    1000,
  );

  assertEquals(summary.co2ThresholdExceededCount, 2);
  assertEquals(summary.co2.latest, 1400);
});

Deno.test("温度と湿度の範囲外件数をカウントできる", () => {
  const summary = summarizeAirQualityEntries([
    createEntry(1000, { temperature: 18, humidity: 40 }),
    createEntry(2000, { temperature: 29, humidity: 39 }),
    createEntry(3000, { temperature: 17, humidity: 71 }),
  ]);

  assertEquals(summary.temperatureOutOfRangeCount, 2);
  assertEquals(summary.humidityOutOfRangeCount, 2);
});

Deno.test("温度と湿度がそろうサンプルから不快指数を集計できる", () => {
  const summary = summarizeAirQualityEntries([
    createEntry(1000, { temperature: 22, humidity: 40 }),
    createEntry(2000, { temperature: 24.2, humidity: 51 }),
    createEntry(3000, { temperature: 25 }),
  ]);

  assertEquals(summary.discomfortIndex, {
    latest: calculateDiscomfortIndex(24.2, 51),
    min: calculateDiscomfortIndex(22, 40),
    max: calculateDiscomfortIndex(24.2, 51),
    average:
      (calculateDiscomfortIndex(22, 40) + calculateDiscomfortIndex(24.2, 51)) /
      2,
  });
});

Deno.test("部分的な基準値から既定値込みで空気品質基準を解決できる", () => {
  const criteria = resolveAirQualityCriteria({
    temperatureMax: 26,
    humidityMin: 45,
  });

  assertEquals(criteria, {
    co2Max: 1000,
    temperatureMin: 18,
    temperatureMax: 26,
    humidityMin: 45,
    humidityMax: 70,
  });
});

Deno.test("時間範囲でHarvest Dataエントリを絞り込める", () => {
  const entries = [
    createEntry(1000, { co2: 700 }),
    createEntry(2000, { co2: 800 }),
    createEntry(3000, { co2: 900 }),
    createEntry(Number.NaN, { co2: 1000 }),
  ];

  const filtered = filterAirQualityEntriesByTimeRange(entries, 2000, 3000);

  assertEquals(filtered, [entries[1]]);
});

Deno.test("固定ウィンドウごとに空気品質を集計できる", () => {
  const buckets = bucketAirQualityEntries([
    createEntry(61000, { co2: 900, temperature: 20 }),
    createEntry(1000, { co2: 600, temperature: 22 }),
    createEntry(59000, { humidity: 40 }),
    createEntry(62000, { co2: 1200, humidity: 50 }),
    createEntry(120000, { other: "ignored" }),
  ], 60000);

  assertEquals(buckets, [
    {
      startTime: 0,
      endTime: 60000,
      summary: {
        sampleCount: 2,
        co2: {
          latest: 600,
          min: 600,
          max: 600,
          average: 600,
        },
        temperature: {
          latest: 22,
          min: 22,
          max: 22,
          average: 22,
        },
        humidity: {
          latest: 40,
          min: 40,
          max: 40,
          average: 40,
        },
        discomfortIndex: {},
        criteria: DEFAULT_AIR_QUALITY_CRITERIA,
        co2Threshold: 1000,
        co2ThresholdExceededCount: 0,
        temperatureRange: { min: 18, max: 28 },
        temperatureOutOfRangeCount: 0,
        humidityRange: { min: 40, max: 70 },
        humidityOutOfRangeCount: 0,
      },
    },
    {
      startTime: 60000,
      endTime: 120000,
      summary: {
        sampleCount: 2,
        co2: {
          latest: 1200,
          min: 900,
          max: 1200,
          average: 1050,
        },
        temperature: {
          latest: 20,
          min: 20,
          max: 20,
          average: 20,
        },
        humidity: {
          latest: 50,
          min: 50,
          max: 50,
          average: 50,
        },
        discomfortIndex: {},
        criteria: DEFAULT_AIR_QUALITY_CRITERIA,
        co2Threshold: 1000,
        co2ThresholdExceededCount: 1,
        temperatureRange: { min: 18, max: 28 },
        temperatureOutOfRangeCount: 0,
        humidityRange: { min: 40, max: 70 },
        humidityOutOfRangeCount: 0,
      },
    },
  ]);
});

Deno.test("CO2平均が最大のバケットを選び同値なら最新を優先する", () => {
  const peakBucket = findPeakCo2Bucket([
    {
      startTime: 0,
      endTime: 60000,
      summary: summarizeAirQualityEntries([createEntry(1000, { co2: 900 })]),
    },
    {
      startTime: 60000,
      endTime: 120000,
      summary: summarizeAirQualityEntries([createEntry(61000, { co2: 1200 })]),
    },
    {
      startTime: 120000,
      endTime: 180000,
      summary: summarizeAirQualityEntries([createEntry(121000, { co2: 1200 })]),
    },
    {
      startTime: 180000,
      endTime: 240000,
      summary: summarizeAirQualityEntries([
        createEntry(181000, { humidity: 45 }),
      ]),
    },
  ]);

  assertEquals(peakBucket?.startTime, 120000);
  assertEquals(peakBucket?.summary.co2.average, 1200);
});

Deno.test("空気品質サマリーの平均値差分を比較できる", () => {
  const comparison = compareAirQualitySummaries(
    {
      sampleCount: 2,
      co2: { average: 800 },
      temperature: { average: 22 },
      humidity: {},
      criteria: DEFAULT_AIR_QUALITY_CRITERIA,
      co2Threshold: 1000,
      co2ThresholdExceededCount: 0,
      temperatureRange: { min: 18, max: 28 },
      temperatureOutOfRangeCount: 0,
      humidityRange: { min: 40, max: 70 },
      humidityOutOfRangeCount: 0,
    },
    {
      sampleCount: 3,
      co2: { average: 950 },
      temperature: { average: 21.5 },
      humidity: { average: 48 },
      criteria: DEFAULT_AIR_QUALITY_CRITERIA,
      co2Threshold: 1000,
      co2ThresholdExceededCount: 1,
      temperatureRange: { min: 18, max: 28 },
      temperatureOutOfRangeCount: 0,
      humidityRange: { min: 40, max: 70 },
      humidityOutOfRangeCount: 0,
    },
  );

  assertEquals(comparison, {
    co2: {
      before: 800,
      after: 950,
      delta: 150,
    },
    temperature: {
      before: 22,
      after: 21.5,
      delta: -0.5,
    },
    humidity: {
      before: undefined,
      after: 48,
      delta: undefined,
    },
  });
});

Deno.test("連続サンプル間の最大 CO2 変化を取得できる", () => {
  const spike = findLargestCo2Spike([
    createEntry(1000, { co2: 700 }),
    createEntry(2000, { co2: 900 }),
    createEntry(3000, { co2: 1200 }),
    createEntry(4000, { co2: 1000 }),
  ]);

  assertEquals(spike, {
    previousTime: 2000,
    currentTime: 3000,
    previousCo2: 900,
    currentCo2: 1200,
    delta: 300,
  });
});

Deno.test("CO2 サンプルが不足する場合はスパイクを返さない", () => {
  const spike = findLargestCo2Spike([
    createEntry(1000, { temperature: 22 }),
    createEntry(2000, { co2: 900 }),
  ]);

  assertEquals(spike, null);
});
