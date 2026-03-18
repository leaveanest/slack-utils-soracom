import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { t } from "../../lib/i18n/mod.ts";
import {
  bucketAirQualityEntries,
  createSoracomClientFromEnv,
  findPeakCo2Bucket,
  listSensorProfiles,
  resolveAirQualityCriteria,
  summarizeAirQualityEntries,
} from "../../lib/soracom/mod.ts";
import type {
  AirQualityBucketSummary,
  AirQualityCriteria,
  AirQualityMetricSummary,
  AirQualitySummary,
  SoracomSensorProfile,
} from "../../lib/soracom/mod.ts";

type AirQualityCriteriaView = {
  co2Max: number;
  temperatureMin: number;
  temperatureMax: number;
  humidityMin: number;
  humidityMax: number;
  co2ViolationCount: number;
  temperatureViolationCount: number;
  humidityViolationCount: number;
};

const DEFAULT_BUCKET_MINUTES = 60;

/**
 * CO2日次空気品質レポート関数定義
 *
 * Datastore に登録済みのセンサープロファイルを走査し、
 * CO2 / 温度 / 湿度の要約と CO2 ピーク時間帯を Slack に投稿します。
 */
export const Co2DailyAirQualityReportFunctionDefinition = DefineFunction({
  callback_id: "co2_daily_air_quality_report",
  title: "CO2日次空気品質レポート",
  description:
    "登録済みセンサーの日次空気品質サマリーとCO2ピーク時間帯を生成します",
  source_file: "functions/co2_daily_air_quality_report/mod.ts",
  input_parameters: {
    properties: {},
    required: [],
  },
  output_parameters: {
    properties: {
      processed_count: {
        type: Schema.types.number,
        description: "処理したセンサープロファイル数",
      },
      reported_count: {
        type: Schema.types.number,
        description: "投稿したレポート数",
      },
      failed_count: {
        type: Schema.types.number,
        description: "失敗したレポート数",
      },
      message: {
        type: Schema.types.string,
        description: "実行サマリー",
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
 * @param peakBucket - CO2 ピーク時間帯
 * @returns フォーマット済みメッセージ
 */
export function formatCo2DailyAirQualityReportMessage(
  sensorName: string,
  imsi: string,
  summary: AirQualitySummary,
  peakBucket: AirQualityBucketSummary | null,
): string {
  const criteria = getAirQualityCriteriaView(summary);

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
    ...formatCriteriaViolationLines(criteria),
    ...formatPeakBucketLines(peakBucket),
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

function formatCriteriaViolationLines(
  criteria: AirQualityCriteriaView,
): [string, string, string] {
  return [
    t("soracom.messages.air_quality_co2_violation_count", {
      threshold: formatMetricNumber(criteria.co2Max),
      count: criteria.co2ViolationCount,
    }),
    t("soracom.messages.air_quality_temperature_violation_count", {
      min: formatMetricNumber(criteria.temperatureMin),
      max: formatMetricNumber(criteria.temperatureMax),
      count: criteria.temperatureViolationCount,
    }),
    t("soracom.messages.air_quality_humidity_violation_count", {
      min: formatMetricNumber(criteria.humidityMin),
      max: formatMetricNumber(criteria.humidityMax),
      count: criteria.humidityViolationCount,
    }),
  ];
}

function formatPeakBucketLines(
  peakBucket: AirQualityBucketSummary | null,
): string[] {
  if (peakBucket === null) {
    return [];
  }

  return [
    t("soracom.messages.air_quality_peak_window", {
      start: new Date(peakBucket.startTime).toISOString(),
      end: new Date(peakBucket.endTime).toISOString(),
    }),
    peakBucket.summary.co2.average !== undefined
      ? t("soracom.messages.air_quality_peak_co2", {
        value: formatMetricNumber(peakBucket.summary.co2.average),
      })
      : t("soracom.messages.air_quality_peak_co2_missing"),
  ];
}

function getAirQualityCriteriaView(
  summary: AirQualitySummary,
): AirQualityCriteriaView {
  return {
    co2Max: summary.criteria.co2Max,
    temperatureMin: summary.criteria.temperatureMin,
    temperatureMax: summary.criteria.temperatureMax,
    humidityMin: summary.criteria.humidityMin,
    humidityMax: summary.criteria.humidityMax,
    co2ViolationCount: summary.co2ThresholdExceededCount,
    temperatureViolationCount: summary.temperatureOutOfRangeCount,
    humidityViolationCount: summary.humidityOutOfRangeCount,
  };
}

function buildProfileCriteria(
  profile: SoracomSensorProfile,
): AirQualityCriteria {
  return resolveAirQualityCriteria({
    co2Max: profile.co2Threshold,
    temperatureMin: profile.temperatureMin,
    temperatureMax: profile.temperatureMax,
    humidityMin: profile.humidityMin,
    humidityMax: profile.humidityMax,
  });
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
  async ({ client, env }) => {
    try {
      console.log(t("soracom.logs.loading_sensor_profiles"));

      const profiles = await listSensorProfiles(client);
      if (profiles.length === 0) {
        throw new Error(t("soracom.errors.sensor_profiles_not_found"));
      }

      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const soracomClient = createSoracomClientFromEnv(env);
      let reportedCount = 0;
      let failedCount = 0;

      for (const profile of profiles) {
        try {
          const criteria = buildProfileCriteria(profile);

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

          const summary = summarizeAirQualityEntries(result.entries, criteria);
          const peakBucket = findPeakCo2Bucket(
            bucketAirQualityEntries(
              result.entries,
              DEFAULT_BUCKET_MINUTES * 60 * 1000,
              criteria,
            ),
          );
          const message = formatCo2DailyAirQualityReportMessage(
            profile.sensorName,
            profile.imsi,
            summary,
            peakBucket,
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
