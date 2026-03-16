import { assertEquals } from "std/testing/asserts.ts";
import type {
  AirQualitySummary,
  AirQualitySummaryDelta,
} from "../../lib/soracom/mod.ts";
import { formatVentilationEffectReviewMessage } from "./mod.ts";

const beforeSummary: AirQualitySummary = {
  sampleCount: 12,
  co2: {
    average: 1100,
  },
  temperature: {
    average: 24.5,
  },
  humidity: {
    average: 55,
  },
  co2Threshold: 1000,
  co2ThresholdExceededCount: 5,
};

const afterSummary: AirQualitySummary = {
  sampleCount: 10,
  co2: {
    average: 800,
  },
  temperature: {
    average: 23.1,
  },
  humidity: {
    average: 47,
  },
  co2Threshold: 1000,
  co2ThresholdExceededCount: 1,
};

const improvementComparison: AirQualitySummaryDelta = {
  co2: {
    before: 1100,
    after: 800,
    delta: -300,
  },
  temperature: {
    before: 24.5,
    after: 23.1,
    delta: -1.4,
  },
  humidity: {
    before: 55,
    after: 47,
    delta: -8,
  },
};

Deno.test({
  name: "換気効果レビューが改善メッセージを正しくフォーマットする",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatVentilationEffectReviewMessage(
      "440101234567890",
      Date.parse("2026-03-16T09:00:00.000Z"),
      beforeSummary,
      afterSummary,
      improvementComparison,
      60,
      60,
    );

    assertEquals(message.includes("440101234567890"), true);
    assertEquals(message.includes("2026-03-16T09:00:00.000Z"), true);
    assertEquals(message.includes("-300"), true);
  },
});

Deno.test({
  name: "前後データがない場合は空データ用メッセージを返す",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatVentilationEffectReviewMessage(
      "440101234567890",
      Date.parse("2026-03-16T09:00:00.000Z"),
      {
        sampleCount: 0,
        co2: {},
        temperature: {},
        humidity: {},
        co2Threshold: 1000,
        co2ThresholdExceededCount: 0,
      },
      {
        sampleCount: 0,
        co2: {},
        temperature: {},
        humidity: {},
        co2Threshold: 1000,
        co2ThresholdExceededCount: 0,
      },
      {
        co2: {},
        temperature: {},
        humidity: {},
      },
      60,
      60,
    );

    assertEquals(message.includes("440101234567890"), true);
    assertEquals(message.length > 0, true);
  },
});
