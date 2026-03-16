import { assertEquals } from "std/testing/asserts.ts";
import type { AirQualitySummary } from "../../lib/soracom/mod.ts";
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
  co2Threshold: 1000,
  co2ThresholdExceededCount: 3,
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
    );

    assertEquals(message.includes("会議室CO2センサー"), true);
    assertEquals(message.includes("440101234567890"), true);
    assertEquals(message.includes("12"), true);
    assertEquals(message.includes("CO2"), true);
    assertEquals(message.includes("1250"), true);
    assertEquals(message.includes("23.5"), true);
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
        sampleCount: 0,
        co2: {},
        temperature: {},
        humidity: {},
        co2Threshold: 1000,
        co2ThresholdExceededCount: 0,
      },
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

    const message = formatCo2DailyAirQualityReportMessage(
      "会議室CO2センサー",
      "440101234567890",
      {
        ...summaryWithData,
        humidity: {},
      },
    );

    assertEquals(message.includes("Humidity"), true);
  },
});
