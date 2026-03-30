import { assertEquals } from "std/testing/asserts.ts";
import { getLocale, setLocale, t } from "../../lib/i18n/mod.ts";
import type {
  AirQualityBucketSummary,
  AirQualitySummary,
  SoracomSim,
} from "../../lib/soracom/mod.ts";
import {
  Co2DailyAirQualityReportFunctionDefinition,
  filterCo2DailyAirQualityReportSims,
  formatCo2DailyAirQualityReportMessage,
  formatCo2DailyAirQualityReportSummaryMessage,
  maskImsiForDisplay,
  resolveCo2DailyAirQualityReportCriteria,
  resolveCo2DailyAirQualitySensorName,
} from "./mod.ts";

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
  discomfortIndex: {
    latest: 70.8,
    min: 68.1,
    max: 71.9,
    average: 69.7,
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
    discomfortIndex: {},
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

const baseSim: SoracomSim = {
  simId: "8942310022000012345",
  imsi: "440101234567890",
  msisdn: "09012345678",
  status: "active",
  speedClass: "s1.standard",
  tags: { name: "会議室CO2センサー" },
  ipAddress: "10.0.0.1",
  createdAt: 1700000000000,
  lastModifiedAt: 1700000000000,
  groupId: "group-1",
  operatorId: "OP001",
  subscription: "plan-D",
  moduleType: "nano",
};

Deno.test({
  name: "期間指定の空気品質レポートが正しくフォーマットされる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatCo2DailyAirQualityReportMessage(
      "会議室CO2センサー",
      "***********7890",
      "1h",
      summaryWithData,
      peakBucket,
    );

    assertEquals(message.includes("会議室CO2センサー"), true);
    assertEquals(message.includes("***********7890"), true);
    assertEquals(message.includes("12"), true);
    assertEquals(message.includes("CO2"), true);
    assertEquals(message.includes("1250"), true);
    assertEquals(message.includes("23.5"), true);
    assertEquals(message.includes("1275"), true);
    assertEquals(message.includes("1時間"), true);
    assertEquals(
      message.includes(t("soracom.messages.air_quality_action_required")),
      true,
    );
    assertEquals(
      message.indexOf(t("soracom.messages.air_quality_action_required")) <
        message.indexOf(
          `*${t("soracom.messages.air_quality_report_section_summary")}*`,
        ),
      true,
    );
    assertEquals(
      message.split("\n")[0],
      t("soracom.messages.co2_daily_air_quality_report_header", {
        sensorName: "会議室CO2センサー",
        imsi: "***********7890",
        period: "1時間",
      }),
    );
    assertEquals(message.split("\n")[0].startsWith("*"), false);
    assertEquals(message.split("\n")[0].endsWith("*"), false);
    assertEquals(message.includes("温度 (℃)"), true);
    assertEquals(message.includes("- CO2 (ppm)\n  - 最新: 950"), true);
    assertEquals(message.includes("  - 平均: 910.4"), true);
    assertEquals(message.includes("- 温度 (℃)\n  - 最新: 24.2"), true);
    assertEquals(message.includes("- 不快指数\n  - 最新: 70.8"), true);
    assertEquals(message.includes("  - 区分: 暑くない"), true);
    assertEquals(message.includes("  - 平均: 69.7"), true);
    assertEquals(
      message.includes("  - 最大: 1250\n\n- 温度 (℃)\n  - 最新: 24.2"),
      true,
    );
    assertEquals(message.includes("  - 最大: 25.4"), true);
    assertEquals(message.includes("2026-03-16 10:00:00 JST"), true);
    assertEquals(
      message.includes("air_quality_temperature_violation_count") ||
        (message.includes("18") && message.includes("28")),
      true,
    );
  },
});

Deno.test({
  name: "不快指数の境界値に応じた区分を表示できる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatCo2DailyAirQualityReportMessage(
      "会議室CO2センサー",
      "***********7890",
      "1h",
      {
        ...summaryWithData,
        discomfortIndex: {
          latest: 75.0,
          min: 68.1,
          max: 75.0,
          average: 71.0,
        },
      },
      peakBucket,
    );

    assertEquals(message.includes("  - 区分: やや暑い"), true);
  },
});

Deno.test({
  name: "違反がない場合は行動喚起文を含めない",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatCo2DailyAirQualityReportMessage(
      "会議室CO2センサー",
      "***********7890",
      "1d",
      {
        ...summaryWithData,
        co2ThresholdExceededCount: 0,
        temperatureOutOfRangeCount: 0,
        humidityOutOfRangeCount: 0,
      },
      peakBucket,
    );

    assertEquals(
      message.includes(t("soracom.messages.air_quality_action_required")),
      false,
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
      "***********7890",
      "1d",
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

    assertEquals(message.includes("***********7890"), true);
    assertEquals(message.includes("1日"), true);
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
        "***********7890",
        "1m",
        {
          ...summaryWithData,
          humidity: {},
          discomfortIndex: {},
        },
        peakBucket,
      );

      assertEquals(
        message.includes(t("soracom.messages.air_quality_metric_humidity")),
        true,
      );
      assertEquals(message.includes("不快指数"), true);
      assertEquals(message.includes("  - データなし"), true);
    } finally {
      setLocale(originalLocale);
    }
  },
});

Deno.test({
  name: "ピーク時間帯が取れない場合も期間付きレポート本文は生成される",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatCo2DailyAirQualityReportMessage(
      "会議室CO2センサー",
      "***********7890",
      "1h",
      summaryWithData,
      null,
    );

    assertEquals(message.includes("会議室CO2センサー"), true);
    assertEquals(message.includes("***********7890"), true);
    assertEquals(message.includes("2026-03-16T01:00:00.000Z"), false);
  },
});

Deno.test({
  name: "IMSIは下4桁以外をマスクして表示する",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    assertEquals(maskImsiForDisplay("440103177036518"), "***********6518");
    assertEquals(maskImsiForDisplay("6518"), "6518");
  },
});

Deno.test({
  name: "グループ内の active SIM のみレポート対象にする",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const sims = filterCo2DailyAirQualityReportSims([
      { ...baseSim, simId: "sim-1", status: "active", groupId: "group-1" },
      { ...baseSim, simId: "sim-2", status: "inactive", groupId: "group-1" },
      { ...baseSim, simId: "sim-3", status: "active", groupId: "group-2" },
    ], "group-1");

    assertEquals(sims.map((sim) => sim.simId), ["sim-1"]);
  },
});

Deno.test({
  name: "SIMタグ名がない場合はIMSIをセンサー名として使う",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const sensorName = resolveCo2DailyAirQualitySensorName({
      ...baseSim,
      tags: {},
    });

    assertEquals(sensorName, baseSim.imsi);
  },
});

Deno.test({
  name: "しきい値入力から空気品質基準を解決できる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const criteria = resolveCo2DailyAirQualityReportCriteria({
      co2_threshold: 1200,
      temperature_min: 19,
      temperature_max: 27,
      humidity_min: 45,
      humidity_max: 65,
    });

    assertEquals(criteria.co2Max, 1200);
    assertEquals(criteria.temperatureMin, 19);
    assertEquals(criteria.temperatureMax, 27);
    assertEquals(criteria.humidityMin, 45);
    assertEquals(criteria.humidityMax, 65);
  },
});

Deno.test({
  name: "空気品質レポートは期間と投稿先を含む入力を持つ",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const definition = Co2DailyAirQualityReportFunctionDefinition
      .definition as {
        input_parameters?: {
          properties?: {
            period?: {
              title?: string;
              enum?: string[];
              default?: string;
              description?: string;
              choices?: Array<{
                value?: string;
                title?: string;
              }>;
            };
            co2_threshold?: {
              description?: string;
              default?: number;
            };
          };
          required?: string[];
        };
      };

    assertEquals(
      definition.input_parameters?.required,
      ["sim_group_id", "channel_id", "period"],
    );
    assertEquals(
      definition.input_parameters?.properties?.period?.enum,
      ["1h", "1d", "1m"],
    );
    assertEquals(
      definition.input_parameters?.properties?.period?.title,
      "集計期間",
    );
    assertEquals(
      definition.input_parameters?.properties?.period?.default,
      "1h",
    );
    assertEquals(
      definition.input_parameters?.properties?.period?.choices?.map((choice) =>
        choice.title
      ),
      ["1時間", "1日", "1ヶ月"],
    );
    assertEquals(
      definition.input_parameters?.properties?.co2_threshold?.default,
      1000,
    );
    assertEquals(
      definition.input_parameters?.properties?.co2_threshold?.description
        ?.includes("既定値: 1000"),
      true,
    );
  },
});

Deno.test({
  name: "サマリーメッセージはグループIDと実行サマリーを含む",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatCo2DailyAirQualityReportSummaryMessage(
      "group-1",
      "1d",
      3,
      2,
      1,
    );

    assertEquals(message.includes("group-1"), true);
    assertEquals(message.includes("1日"), true);
    assertEquals(message.includes("3"), true);
    assertEquals(message.includes("2"), true);
    assertEquals(message.includes("1"), true);
  },
});
