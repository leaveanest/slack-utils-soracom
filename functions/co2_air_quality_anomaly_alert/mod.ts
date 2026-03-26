import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { t } from "../../lib/i18n/mod.ts";
import type { AirQualitySummary } from "../../lib/soracom/mod.ts";
import {
  createSoracomClientFromEnv,
  summarizeAirQualityEntries,
} from "../../lib/soracom/mod.ts";
import {
  airQualityReportPeriodSchema,
  channelIdSchema,
  imsiSchema,
  nonEmptyStringSchema,
} from "../../lib/validation/schemas.ts";
import {
  filterCo2DailyAirQualityReportSims,
  maskImsiForDisplay,
  resolveCo2DailyAirQualityReportCriteria,
  resolveCo2DailyAirQualitySensorName,
} from "../co2_daily_air_quality_report/mod.ts";

const AIR_QUALITY_REPORT_PERIOD_OPTIONS = ["1h", "1d", "1m"] as const;
type AirQualityReportPeriod = typeof AIR_QUALITY_REPORT_PERIOD_OPTIONS[number];
const AIR_QUALITY_REPORT_PERIOD_CHOICES = [
  { value: "1h", title: "1時間", description: "直近1時間を集計" },
  { value: "1d", title: "1日", description: "直近1日を集計" },
  { value: "1m", title: "1ヶ月", description: "直近30日を集計" },
] as const;

type Co2AirQualityAnomalyAlertInputs = {
  sim_group_id: string;
  channel_id: string;
  period: string;
  co2_threshold?: number;
  temperature_min?: number;
  temperature_max?: number;
  humidity_min?: number;
  humidity_max?: number;
};

export type AirQualityAnomalySensorResult = {
  sensorName: string;
  imsi: string;
  summary: AirQualitySummary;
};

/**
 * 空気品質異常検知関数定義
 *
 * 指定した SIM グループ配下の active SIM を走査し、
 * CO2 / 温度 / 湿度のしきい値逸脱を検知して Slack に投稿します。
 */
export const Co2AirQualityAnomalyAlertFunctionDefinition = DefineFunction({
  callback_id: "co2_air_quality_anomaly_alert",
  title: "空気品質異常検知",
  description: "指定した SIM グループの空気品質異常を検知して通知します",
  source_file: "functions/co2_air_quality_anomaly_alert/mod.ts",
  input_parameters: {
    properties: {
      sim_group_id: {
        type: Schema.types.string,
        title: "SIMグループID",
        description: "対象の SIM グループ ID",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        title: "投稿先チャンネル",
        description: "通知投稿先チャンネル",
      },
      period: {
        type: Schema.types.string,
        title: "集計期間",
        description: "集計期間を選択してください（既定値: 1時間）",
        enum: AIR_QUALITY_REPORT_PERIOD_OPTIONS,
        choices: AIR_QUALITY_REPORT_PERIOD_CHOICES,
        default: "1h",
      },
      co2_threshold: {
        type: Schema.types.number,
        title: "CO2しきい値",
        description: "CO2 しきい値（ppm、既定値: 1000）",
        default: 1000,
      },
      temperature_min: {
        type: Schema.types.number,
        title: "温度下限",
        description: "温度下限しきい値（℃、既定値: 18）",
        default: 18,
      },
      temperature_max: {
        type: Schema.types.number,
        title: "温度上限",
        description: "温度上限しきい値（℃、既定値: 28）",
        default: 28,
      },
      humidity_min: {
        type: Schema.types.number,
        title: "湿度下限",
        description: "湿度下限しきい値（%、既定値: 40）",
        default: 40,
      },
      humidity_max: {
        type: Schema.types.number,
        title: "湿度上限",
        description: "湿度上限しきい値（%、既定値: 70）",
        default: 70,
      },
    },
    required: ["sim_group_id", "channel_id", "period"],
  },
  output_parameters: {
    properties: {
      processed_count: {
        type: Schema.types.number,
        title: "対象SIM数",
        description: "処理した SIM 数",
      },
      anomaly_count: {
        type: Schema.types.number,
        title: "異常SIM数",
        description: "異常を検知した SIM 数",
      },
      has_anomaly: {
        type: Schema.types.boolean,
        title: "異常あり",
        description: "異常を検知したかどうか",
      },
      no_data_count: {
        type: Schema.types.number,
        title: "データなしSIM数",
        description: "データが見つからなかった SIM 数",
      },
      failed_count: {
        type: Schema.types.number,
        title: "取得失敗SIM数",
        description: "取得失敗した SIM 数",
      },
      message_ts: {
        type: Schema.types.string,
        title: "投稿メッセージTS",
        description: "投稿メッセージの ts",
      },
      message: {
        type: Schema.types.string,
        title: "投稿メッセージ",
        description: "投稿した通知メッセージ",
      },
    },
    required: [
      "processed_count",
      "anomaly_count",
      "has_anomaly",
      "no_data_count",
      "failed_count",
      "message_ts",
      "message",
    ],
  },
});

/**
 * 空気品質サマリーに異常があるかを判定します。
 *
 * @param summary - 集計済み空気品質サマリー
 * @returns いずれかの基準を逸脱していれば `true`
 */
export function isAirQualitySummaryAnomalous(
  summary: AirQualitySummary,
): boolean {
  return summary.co2ThresholdExceededCount > 0 ||
    summary.temperatureOutOfRangeCount > 0 ||
    summary.humidityOutOfRangeCount > 0;
}

/**
 * 空気品質異常検知メッセージを生成します。
 *
 * @param simGroupId - 対象 SIM グループ ID
 * @param period - 集計期間
 * @param anomalousResults - 異常を検知したセンサー一覧
 * @param processedCount - 対象 SIM 数
 * @param noDataCount - データなし SIM 数
 * @param failedCount - 取得失敗 SIM 数
 * @returns Slack 投稿向けメッセージ
 */
export function formatAirQualityAnomalyAlertMessage(
  simGroupId: string,
  period: AirQualityReportPeriod,
  anomalousResults: AirQualityAnomalySensorResult[],
  processedCount: number,
  noDataCount: number,
  failedCount: number,
): string {
  const periodLabel = formatAirQualityReportPeriodLabel(period);
  const summaryLine = t("soracom.messages.air_quality_anomaly_summary", {
    processed: processedCount,
    anomalies: anomalousResults.length,
    noData: noDataCount,
    failed: failedCount,
  });

  if (anomalousResults.length === 0) {
    return [
      t("soracom.messages.air_quality_anomaly_none", {
        groupId: simGroupId,
        period: periodLabel,
      }),
      summaryLine,
    ].join("\n");
  }

  const sensorSections = anomalousResults.map(({ sensorName, imsi, summary }) =>
    [
      t("soracom.messages.air_quality_anomaly_sensor_header", {
        sensorName,
        imsi,
      }),
      ...toBulletLines([
        t("soracom.messages.air_quality_sample_count", {
          count: summary.sampleCount,
        }),
        ...formatAnomalyViolationLines(summary),
      ]),
    ].join("\n")
  );

  return [
    t("soracom.messages.air_quality_anomaly_header", {
      groupId: simGroupId,
      period: periodLabel,
      count: anomalousResults.length,
      total: processedCount,
    }),
    summaryLine,
    sensorSections.join("\n\n"),
  ].join("\n\n");
}

function formatMetricNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(1);
}

function formatAirQualityReportPeriodLabel(
  period: AirQualityReportPeriod,
): string {
  switch (period) {
    case "1h":
      return t("soracom.messages.air_quality_report_period_1h");
    case "1d":
      return t("soracom.messages.air_quality_report_period_1d");
    case "1m":
      return t("soracom.messages.air_quality_report_period_1m");
  }
}

function resolveAirQualityReportLookbackMs(
  period: AirQualityReportPeriod,
): number {
  switch (period) {
    case "1h":
      return 60 * 60 * 1000;
    case "1d":
      return 24 * 60 * 60 * 1000;
    case "1m":
      return 30 * 24 * 60 * 60 * 1000;
  }
}

function formatAnomalyViolationLines(summary: AirQualitySummary): string[] {
  const lines: string[] = [];

  if (summary.co2ThresholdExceededCount > 0) {
    lines.push(
      t("soracom.messages.air_quality_co2_violation_count", {
        threshold: formatMetricNumber(summary.criteria.co2Max),
        count: summary.co2ThresholdExceededCount,
      }),
    );
  }

  if (summary.temperatureOutOfRangeCount > 0) {
    lines.push(
      t("soracom.messages.air_quality_temperature_violation_count", {
        min: formatMetricNumber(summary.criteria.temperatureMin),
        max: formatMetricNumber(summary.criteria.temperatureMax),
        count: summary.temperatureOutOfRangeCount,
      }),
    );
  }

  if (summary.humidityOutOfRangeCount > 0) {
    lines.push(
      t("soracom.messages.air_quality_humidity_violation_count", {
        min: formatMetricNumber(summary.criteria.humidityMin),
        max: formatMetricNumber(summary.criteria.humidityMax),
        count: summary.humidityOutOfRangeCount,
      }),
    );
  }

  return lines;
}

function toBulletLines(lines: string[]): string[] {
  return lines.map((line) => `- ${line}`);
}

export default SlackFunction(
  Co2AirQualityAnomalyAlertFunctionDefinition,
  async ({ inputs, client, env }) => {
    try {
      const {
        sim_group_id: simGroupIdRaw,
        channel_id: channelIdRaw,
        period: periodRaw,
      } = inputs as Co2AirQualityAnomalyAlertInputs;
      const simGroupId = nonEmptyStringSchema.parse(
        typeof simGroupIdRaw === "string" ? simGroupIdRaw.trim() : "",
      );
      const channelId = channelIdSchema.parse(channelIdRaw);
      const period = airQualityReportPeriodSchema.parse(
        periodRaw,
      ) as AirQualityReportPeriod;
      const criteria = resolveCo2DailyAirQualityReportCriteria(inputs);

      console.log(
        t("soracom.logs.checking_air_quality_anomaly", {
          groupId: simGroupId,
        }),
      );

      const now = Date.now();
      const lookbackStart = now - resolveAirQualityReportLookbackMs(period);
      const soracomClient = createSoracomClientFromEnv(env);
      const allSims = await soracomClient.listAllSims();
      const simsInGroup = allSims.filter((sim) => sim.groupId === simGroupId);

      if (simsInGroup.length === 0) {
        throw new Error(
          t("soracom.errors.sim_group_sims_not_found", {
            groupId: simGroupId,
          }),
        );
      }

      const targetSims = filterCo2DailyAirQualityReportSims(
        simsInGroup,
        simGroupId,
      );
      if (targetSims.length === 0) {
        throw new Error(
          t("soracom.errors.sim_group_active_sims_not_found", {
            groupId: simGroupId,
            count: simsInGroup.length,
          }),
        );
      }

      const anomalousResults: AirQualityAnomalySensorResult[] = [];
      let noDataCount = 0;
      let failedCount = 0;

      for (const sim of targetSims) {
        try {
          const imsi = imsiSchema.parse(sim.imsi);

          console.log(
            t("soracom.logs.checking_air_quality_anomaly_sim", {
              imsi,
              period: formatAirQualityReportPeriodLabel(period),
            }),
          );

          const result = await soracomClient.getHarvestData(
            imsi,
            lookbackStart,
            now,
          );
          const summary = summarizeAirQualityEntries(result.entries, criteria);

          if (summary.sampleCount === 0) {
            noDataCount += 1;
            continue;
          }

          if (!isAirQualitySummaryAnomalous(summary)) {
            continue;
          }

          anomalousResults.push({
            sensorName: resolveCo2DailyAirQualitySensorName(sim),
            imsi: maskImsiForDisplay(imsi),
            summary,
          });
        } catch (error) {
          failedCount += 1;
          const errorMessage = error instanceof Error
            ? error.message
            : String(error);
          console.error(
            `co2_air_quality_anomaly_alert sim error (${
              sim.imsi || sim.simId
            }):`,
            errorMessage,
          );
        }
      }

      if (failedCount === targetSims.length) {
        throw new Error(t("soracom.errors.air_quality_anomaly_all_failed"));
      }

      const message = formatAirQualityAnomalyAlertMessage(
        simGroupId,
        period,
        anomalousResults,
        targetSims.length,
        noDataCount,
        failedCount,
      );
      const response = await client.chat.postMessage({
        channel: channelId,
        text: message,
      });

      if (!response.ok) {
        throw new Error(
          t("errors.api_call_failed", {
            error: response.error ?? "chat.postMessage_failed",
          }),
        );
      }

      const messageTs = response.ts;
      if (!messageTs) {
        throw new Error(t("errors.data_not_found"));
      }

      return {
        outputs: {
          processed_count: targetSims.length,
          anomaly_count: anomalousResults.length,
          has_anomaly: anomalousResults.length > 0,
          no_data_count: noDataCount,
          failed_count: failedCount,
          message_ts: messageTs,
          message,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("co2_air_quality_anomaly_alert error:", errorMessage);
      return { error: errorMessage };
    }
  },
);
