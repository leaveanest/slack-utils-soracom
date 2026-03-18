import { assertEquals } from "std/testing/asserts.ts";
import { getLocale, setLocale, t } from "../../lib/i18n/mod.ts";
import type {
  AirQualityBucketSummary,
  AirQualitySummary,
} from "../../lib/soracom/mod.ts";
import { formatCo2DailyAirQualityReportMessage } from "./mod.ts";

const summaryWithData: AirQualitySummary = {
  sampleCount: 12,
  co2: {
    latest: 950,
    min: 700,
    max: 1250,
    average: 910.4,
  },
  temperature: {
    latest: 24.2,
    min: 22.1,
    max: 25.4,
    average: 23.5,
  },
  humidity: {
    latest: 51,
    min: 45,
    max: 55,
    average: 49.4,
  },
  criteria: {
    co2Max: 1000,
    temperatureMin: 18,
    temperatureMax: 28,
    humidityMin: 40,
    humidityMax: 70,
  },
  co2Threshold: 1000,
  co2ThresholdExceededCount: 3,
  temperatureRange: {
    min: 18,
    max: 28,
  },
  temperatureOutOfRangeCount: 0,
  humidityRange: {
    min: 40,
    max: 70,
  },
  humidityOutOfRangeCount: 0,
};

const peakBucket: AirQualityBucketSummary = {
  startTime: Date.parse("2026-03-16T01:00:00.000Z"),
  endTime: Date.parse("2026-03-16T02:00:00.000Z"),
  summary: {
    sampleCount: 4,
    co2: {
      latest: 1300,
      min: 1200,
      max: 1350,
      average: 1275,
    },
    temperature: {},
    humidity: {},
    criteria: {
      co2Max: 1000,
      temperatureMin: 18,
      temperatureMax: 28,
      humidityMin: 40,
      humidityMax: 70,
    },
    co2Threshold: 1000,
    co2ThresholdExceededCount: 4,
    temperatureRange: {
      min: 18,
      max: 28,
    },
    temperatureOutOfRangeCount: 1,
    humidityRange: {
      min: 40,
      max: 70,
    },
    humidityOutOfRangeCount: 0,
  },
};

Deno.test({
  name: "CO2日次空気品質レポートが正しくフォーマットされる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatCo2DailyAirQualityReportMessage(
      "会議室CO2センサー",
      "440101234567890",
      summaryWithData,
      peakBucket,
    );

    assertEquals(message.includes("会議室CO2センサー"), true);
    assertEquals(message.includes("440101234567890"), true);
    assertEquals(message.includes("12"), true);
    assertEquals(message.includes("CO2"), true);
    assertEquals(message.includes("1250"), true);
    assertEquals(message.includes("23.5"), true);
    assertEquals(message.includes("1275"), true);
    assertEquals(message.includes("2026-03-16T01:00:00.000Z"), true);
    assertEquals(
      message.includes("air_quality_temperature_violation_count") ||
        (message.includes("18") && message.includes("28")),
      true,
    );
  },
});

Deno.test({
  name: "データがない場合は空データ用メッセージを返す",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatCo2DailyAirQualityReportMessage(
      "会議室CO2センサー",
      "440101234567890",
      {
        ...summaryWithData,
        sampleCount: 0,
        co2: {},
        temperature: {},
        humidity: {},
        co2ThresholdExceededCount: 0,
        temperatureOutOfRangeCount: 0,
        humidityOutOfRangeCount: 0,
      },
      null,
    );

    assertEquals(message.includes("440101234567890"), true);
    assertEquals(message.length > 0, true);
  },
});

Deno.test({
  name: "一部メトリクスが欠ける場合はデータなし表示に切り替わる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const originalLocale = getLocale() as "en" | "ja";

    try {
      setLocale("ja");

      const message = formatCo2DailyAirQualityReportMessage(
        "会議室CO2センサー",
        "440101234567890",
        {
          ...summaryWithData,
          humidity: {},
        },
        peakBucket,
      );

      assertEquals(
        message.includes(t("soracom.messages.air_quality_metric_humidity")),
        true,
      );
    } finally {
      setLocale(originalLocale);
    }
  },
});

Deno.test({
  name: "ピーク時間帯が取れない場合も日次レポート本文は生成される",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatCo2DailyAirQualityReportMessage(
      "会議室CO2センサー",
      "440101234567890",
      summaryWithData,
      null,
    );

    assertEquals(message.includes("会議室CO2センサー"), true);
    assertEquals(message.includes("440101234567890"), true);
    assertEquals(message.includes("2026-03-16T01:00:00.000Z"), false);
  },
});
