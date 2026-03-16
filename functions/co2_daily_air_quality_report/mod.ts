import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { t } from "../../lib/i18n/mod.ts";
import {
  createSoracomClientFromEnv,
  listSensorProfiles,
  summarizeAirQualityEntries,
} from "../../lib/soracom/mod.ts";
import type {
  AirQualityMetricSummary,
  AirQualitySummary,
} from "../../lib/soracom/mod.ts";

const DEFAULT_CO2_THRESHOLD = 1000;

/**
 * CO2日次空気品質レポート関数定義
 *
 * Datastore に登録済みのセンサープロファイルを走査し、
 * CO2 / 温度 / 湿度の要約を Slack に投稿します。
 */
export const Co2DailyAirQualityReportFunctionDefinition = DefineFunction({
  callback_id: "co2_daily_air_quality_report",
  title: "CO2 Daily Air Quality Report",
  description:
    "Generate daily air quality summaries from stored sensor profiles",
  source_file: "functions/co2_daily_air_quality_report/mod.ts",
  input_parameters: {
    properties: {},
    required: [],
  },
  output_parameters: {
    properties: {
      processed_count: {
        type: Schema.types.number,
        description: "Number of sensor profiles processed",
      },
      reported_count: {
        type: Schema.types.number,
        description: "Number of reports posted",
      },
      failed_count: {
        type: Schema.types.number,
        description: "Number of failed reports",
      },
      message: {
        type: Schema.types.string,
        description: "Execution summary",
      },
    },
    required: ["processed_count", "reported_count", "failed_count", "message"],
  },
});

/**
 * 日次空気品質レポートの Slack メッセージを生成します。
 *
 * @param sensorName - センサー表示名
 * @param imsi - IMSI
 * @param summary - 集計済み空気品質サマリー
 * @returns フォーマット済みメッセージ
 */
export function formatCo2DailyAirQualityReportMessage(
  sensorName: string,
  imsi: string,
  summary: AirQualitySummary,
): string {
  if (summary.sampleCount === 0) {
    return [
      `*${
        t("soracom.messages.co2_daily_air_quality_report_header", {
          sensorName,
          imsi,
        })
      }*`,
      t("soracom.messages.co2_daily_air_quality_report_no_data"),
    ].join("\n\n");
  }

  return [
    `*${
      t("soracom.messages.co2_daily_air_quality_report_header", {
        sensorName,
        imsi,
      })
    }*`,
    t("soracom.messages.air_quality_sample_count", {
      count: summary.sampleCount,
    }),
    t("soracom.messages.air_quality_threshold_exceeded", {
      threshold: formatMetricNumber(summary.co2Threshold),
      count: summary.co2ThresholdExceededCount,
    }),
    formatMetricSummaryLine(
      t("soracom.messages.air_quality_metric_co2"),
      summary.co2,
    ),
    formatMetricSummaryLine(
      t("soracom.messages.air_quality_metric_temperature"),
      summary.temperature,
    ),
    formatMetricSummaryLine(
      t("soracom.messages.air_quality_metric_humidity"),
      summary.humidity,
    ),
  ].join("\n");
}

/**
 * 1つのメトリクス要約を表示用文字列に変換します。
 *
 * @param label - 表示名
 * @param summary - メトリクス要約
 * @returns フォーマット済み文字列
 */
function formatMetricSummaryLine(
  label: string,
  summary: AirQualityMetricSummary,
): string {
  if (
    summary.latest === undefined ||
    summary.average === undefined ||
    summary.min === undefined ||
    summary.max === undefined
  ) {
    return t("soracom.messages.air_quality_metric_unavailable", { label });
  }

  return t("soracom.messages.air_quality_metric_line", {
    label,
    latest: formatMetricNumber(summary.latest),
    average: formatMetricNumber(summary.average),
    min: formatMetricNumber(summary.min),
    max: formatMetricNumber(summary.max),
  });
}

/**
 * 数値を表示向けに丸めて文字列化します。
 *
 * @param value - 表示対象の数値
 * @returns 文字列化された数値
 */
function formatMetricNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(1);
}

function formatExecutionSummary(
  processedCount: number,
  reportedCount: number,
  failedCount: number,
): string {
  return t("soracom.messages.sensor_profile_batch_summary", {
    processed: processedCount,
    reported: reportedCount,
    failed: failedCount,
  });
}

export default SlackFunction(
  Co2DailyAirQualityReportFunctionDefinition,
  async ({ client }) => {
    try {
      console.log(t("soracom.logs.loading_sensor_profiles"));

      const profiles = await listSensorProfiles(client);
      if (profiles.length === 0) {
        throw new Error(t("soracom.errors.sensor_profiles_not_found"));
      }

      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const soracomClient = createSoracomClientFromEnv();
      let reportedCount = 0;
      let failedCount = 0;

      for (const profile of profiles) {
        try {
          const co2Threshold = profile.co2Threshold ?? DEFAULT_CO2_THRESHOLD;
          if (!Number.isFinite(co2Threshold) || co2Threshold <= 0) {
            throw new Error(t("errors.invalid_input"));
          }

          console.log(
            t("soracom.logs.generating_co2_daily_air_quality_report", {
              imsi: profile.imsi,
            }),
          );

          const result = await soracomClient.getHarvestData(
            profile.imsi,
            oneDayAgo,
            now,
          );

          const summary = summarizeAirQualityEntries(
            result.entries,
            co2Threshold,
          );
          const message = formatCo2DailyAirQualityReportMessage(
            profile.sensorName,
            profile.imsi,
            summary,
          );

          await client.chat.postMessage({
            channel: profile.reportChannelId,
            text: message,
          });
          reportedCount += 1;
        } catch (error) {
          failedCount += 1;
          const errorMessage = error instanceof Error
            ? error.message
            : String(error);
          console.error(
            `co2_daily_air_quality_report profile error (${profile.imsi}):`,
            errorMessage,
          );
        }
      }

      if (reportedCount === 0) {
        throw new Error(t("soracom.errors.daily_reports_all_failed"));
      }

      const message = formatExecutionSummary(
        profiles.length,
        reportedCount,
        failedCount,
      );

      return {
        outputs: {
          processed_count: profiles.length,
          reported_count: reportedCount,
          failed_count: failedCount,
          message,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("co2_daily_air_quality_report error:", errorMessage);
      return { error: errorMessage };
    }
  },
);
