import { assertEquals } from "std/testing/asserts.ts";
import type { AirQualitySummary } from "../../lib/soracom/mod.ts";
import {
  type AirQualityAnomalySensorResult,
  Co2AirQualityAnomalyAlertFunctionDefinition,
  formatAirQualityAnomalyAlertMessage,
  isAirQualitySummaryAnomalous,
} from "./mod.ts";

const anomalousSummary: AirQualitySummary = {
  sampleCount: 12,
  co2: {
    latest: 1200,
    min: 820,
    max: 1400,
    average: 1080.5,
  },
  temperature: {
    latest: 29.4,
    min: 21.2,
    max: 29.4,
    average: 25.6,
  },
  humidity: {
    latest: 58,
    min: 44,
    max: 58,
    average: 51.2,
  },
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
  temperatureOutOfRangeCount: 2,
  humidityRange: {
    min: 40,
    max: 70,
  },
  humidityOutOfRangeCount: 0,
};

Deno.test({
  name: "空気品質異常を検知できる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    assertEquals(isAirQualitySummaryAnomalous(anomalousSummary), true);
  },
});

Deno.test({
  name: "違反件数がすべて0件なら異常なしになる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    assertEquals(
      isAirQualitySummaryAnomalous({
        ...anomalousSummary,
        co2ThresholdExceededCount: 0,
        temperatureOutOfRangeCount: 0,
        humidityOutOfRangeCount: 0,
      }),
      false,
    );
  },
});

Deno.test({
  name: "異常検知メッセージに期間と違反内容が含まれる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatAirQualityAnomalyAlertMessage(
      "group-1",
      "1h",
      [
        {
          sensorName: "会議室CO2センサー",
          imsi: "***********7890",
          summary: anomalousSummary,
        } satisfies AirQualityAnomalySensorResult,
      ],
      3,
      1,
      0,
    );

    assertEquals(message.includes("group-1"), true);
    assertEquals(message.includes("1時間"), true);
    assertEquals(message.includes("会議室CO2センサー"), true);
    assertEquals(message.includes("***********7890"), true);
    assertEquals(message.includes("CO2 1000 ppm 超過: 4件"), true);
    assertEquals(message.includes("温度 18 - 28 ℃ 範囲外: 2件"), true);
    assertEquals(message.includes("湿度 40 - 70 % 範囲外"), false);
    assertEquals(message.includes("対象 3台"), true);
    assertEquals(message.includes("異常 1台"), true);
    assertEquals(message.includes("データなし 1台"), true);
  },
});

Deno.test({
  name: "異常がない場合は正常メッセージを返す",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatAirQualityAnomalyAlertMessage(
      "group-1",
      "1d",
      [],
      5,
      2,
      1,
    );

    assertEquals(message.includes(":white_check_mark:"), true);
    assertEquals(message.includes("group-1"), true);
    assertEquals(message.includes("1日"), true);
    assertEquals(message.includes("異常 0台"), true);
    assertEquals(message.includes("取得失敗 1台"), true);
  },
});

Deno.test({
  name: "空気品質異常検知はレポートと同じ入力選択肢を持つ",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const definition = Co2AirQualityAnomalyAlertFunctionDefinition
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
      definition.input_parameters?.properties?.period?.title,
      "集計期間",
    );
    assertEquals(
      definition.input_parameters?.properties?.period?.enum,
      ["1h", "1d", "1m"],
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
  name: "空気品質異常検知は後続step向けの出力を持つ",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const definition = Co2AirQualityAnomalyAlertFunctionDefinition
      .definition as {
        output_parameters?: {
          properties?: {
            has_anomaly?: {
              type?: string;
              title?: string;
            };
            message_ts?: {
              type?: string;
              title?: string;
            };
            anomaly_count?: {
              title?: string;
            };
          };
          required?: string[];
        };
      };

    assertEquals(
      definition.output_parameters?.properties?.has_anomaly?.type,
      "boolean",
    );
    assertEquals(
      definition.output_parameters?.properties?.has_anomaly?.title,
      "異常あり",
    );
    assertEquals(
      definition.output_parameters?.properties?.message_ts?.type,
      "string",
    );
    assertEquals(
      definition.output_parameters?.properties?.message_ts?.title,
      "投稿メッセージTS",
    );
    assertEquals(
      definition.output_parameters?.properties?.anomaly_count?.title,
      "異常SIM数",
    );
    assertEquals(
      definition.output_parameters?.required?.includes("has_anomaly"),
      true,
    );
    assertEquals(
      definition.output_parameters?.required?.includes("message_ts"),
      true,
    );
  },
});
