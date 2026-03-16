import { assertEquals } from "std/testing/asserts.ts";
import type { AirQualitySummary, SoraCamEvent } from "../../lib/soracom/mod.ts";
import { formatEnvironmentAndCameraDailyDigestMessage } from "./mod.ts";

const summaryWithData: AirQualitySummary = {
  sampleCount: 12,
  co2: {
    latest: 930,
    min: 700,
    max: 1220,
    average: 905.4,
  },
  temperature: {
    latest: 24.3,
    min: 22.4,
    max: 25.0,
    average: 23.6,
  },
  humidity: {
    latest: 49,
    min: 44,
    max: 54,
    average: 47.8,
  },
  co2Threshold: 1000,
  co2ThresholdExceededCount: 2,
};

const events: SoraCamEvent[] = [
  {
    deviceId: "dev-1",
    eventType: "motion",
    eventTime: Date.parse("2026-03-16T10:00:00.000Z"),
    eventInfo: {},
  },
  {
    deviceId: "dev-1",
    eventType: "motion",
    eventTime: Date.parse("2026-03-16T09:00:00.000Z"),
    eventInfo: {},
  },
  {
    deviceId: "dev-1",
    eventType: "sound",
    eventTime: Date.parse("2026-03-16T08:00:00.000Z"),
    eventInfo: {},
  },
];

Deno.test({
  name: "環境とカメラの日次ダイジェストが正しくフォーマットされる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatEnvironmentAndCameraDailyDigestMessage(
      "会議室CO2センサー",
      "440101234567890",
      "dev-1",
      summaryWithData,
      events,
    );

    assertEquals(message.includes("会議室CO2センサー"), true);
    assertEquals(message.includes("440101234567890"), true);
    assertEquals(message.includes("dev-1"), true);
    assertEquals(message.includes("motion:2"), true);
    assertEquals(message.includes("2026-03-16T10:00:00.000Z"), true);
  },
});

Deno.test({
  name: "データが空の場合は空メッセージを含むダイジェストを返す",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatEnvironmentAndCameraDailyDigestMessage(
      "会議室CO2センサー",
      "440101234567890",
      "dev-1",
      {
        sampleCount: 0,
        co2: {},
        temperature: {},
        humidity: {},
        co2Threshold: 1000,
        co2ThresholdExceededCount: 0,
      },
      [],
    );

    assertEquals(message.includes("440101234567890"), true);
    assertEquals(message.length > 0, true);
  },
});
