import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { t } from "../../lib/i18n/mod.ts";
import {
  compareAirQualitySummaries,
  CONFIG_KEYS,
  createSoracomClientFromEnv,
  filterAirQualityEntriesByTimeRange,
  getConfigValue,
  summarizeAirQualityEntries,
} from "../../lib/soracom/mod.ts";
import type {
  AirQualityMetricDelta,
  AirQualitySummary,
  AirQualitySummaryDelta,
} from "../../lib/soracom/mod.ts";
import { imsiSchema } from "../../lib/validation/schemas.ts";

const DEFAULT_CO2_THRESHOLD = 1000;
const DEFAULT_BEFORE_MINUTES = 60;
const DEFAULT_AFTER_MINUTES = 60;

/**
 * 換気効果振り返り関数定義
 *
 * 指定時刻の前後で Harvest Data を比較し、
 * 換気前後の空気品質変化を Slack に投稿します。
 */
export const VentilationEffectReviewFunctionDefinition = DefineFunction({
  callback_id: "ventilation_effect_review",
  title: "Ventilation Effect Review",
  description:
    "Compare air quality before and after a ventilation reference time",
  source_file: "functions/ventilation_effect_review/mod.ts",
  input_parameters: {
    properties: {
      imsi: {
        type: Schema.types.string,
        description: "IMSI of the subscriber (15 digits)",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "Channel to post results",
      },
      reference_time: {
        type: Schema.types.string,
        description: "Reference time in ISO 8601 format",
      },
      before_minutes: {
        type: Schema.types.number,
        description: "Window length before the reference time in minutes",
      },
      after_minutes: {
        type: Schema.types.number,
        description: "Window length after the reference time in minutes",
      },
      co2_threshold: {
        type: Schema.types.number,
        description: "CO2 alert threshold in ppm",
      },
    },
    required: ["imsi", "channel_id", "reference_time"],
  },
  output_parameters: {
    properties: {
      imsi: {
        type: Schema.types.string,
        description: "IMSI",
      },
      before_sample_count: {
        type: Schema.types.number,
        description: "Number of samples before the reference time",
      },
      after_sample_count: {
        type: Schema.types.number,
        description: "Number of samples after the reference time",
      },
      message: {
        type: Schema.types.string,
        description: "Formatted ventilation effect review message",
      },
    },
    required: ["imsi", "before_sample_count", "after_sample_count", "message"],
  },
});

/**
 * 換気前後比較メッセージを生成します。
 *
 * @param imsi - IMSI
 * @param referenceTime - 基準時刻
 * @param beforeSummary - 基準前サマリー
 * @param afterSummary - 基準後サマリー
 * @param comparison - 前後比較結果
 * @param beforeMinutes - 基準前の比較時間
 * @param afterMinutes - 基準後の比較時間
 * @returns フォーマット済みメッセージ
 */
export function formatVentilationEffectReviewMessage(
  imsi: string,
  referenceTime: number,
  beforeSummary: AirQualitySummary,
  afterSummary: AirQualitySummary,
  comparison: AirQualitySummaryDelta,
  beforeMinutes: number,
  afterMinutes: number,
): string {
  const header = `*${
    t("soracom.messages.ventilation_effect_review_header", {
      imsi,
      referenceTime: new Date(referenceTime).toISOString(),
    })
  }*`;

  if (beforeSummary.sampleCount === 0 && afterSummary.sampleCount === 0) {
    return [
      header,
      t("soracom.messages.ventilation_effect_review_no_data"),
    ].join("\n\n");
  }

  return [
    header,
    t("soracom.messages.ventilation_effect_review_window_before", {
      minutes: beforeMinutes,
      count: beforeSummary.sampleCount,
    }),
    t("soracom.messages.ventilation_effect_review_window_after", {
      minutes: afterMinutes,
      count: afterSummary.sampleCount,
    }),
    t("soracom.messages.ventilation_effect_review_threshold_change", {
      before: beforeSummary.co2ThresholdExceededCount,
      after: afterSummary.co2ThresholdExceededCount,
      threshold: formatMetricNumber(afterSummary.co2Threshold),
    }),
    buildCo2AssessmentLine(comparison.co2),
    formatComparisonLine(
      t("soracom.messages.air_quality_metric_co2"),
      comparison.co2,
    ),
    formatComparisonLine(
      t("soracom.messages.air_quality_metric_temperature"),
      comparison.temperature,
    ),
    formatComparisonLine(
      t("soracom.messages.air_quality_metric_humidity"),
      comparison.humidity,
    ),
  ].join("\n");
}

/**
 * CO2 前後比較の評価文を生成します。
 *
 * @param comparison - CO2 比較結果
 * @returns フォーマット済み文字列
 */
function buildCo2AssessmentLine(comparison: AirQualityMetricDelta): string {
  if (comparison.delta === undefined) {
    return t("soracom.messages.ventilation_effect_review_co2_unknown");
  }

  if (comparison.delta < 0) {
    return t("soracom.messages.ventilation_effect_review_co2_improved", {
      delta: formatMetricNumber(Math.abs(comparison.delta)),
    });
  }

  if (comparison.delta > 0) {
    return t("soracom.messages.ventilation_effect_review_co2_worsened", {
      delta: formatMetricNumber(comparison.delta),
    });
  }

  return t("soracom.messages.ventilation_effect_review_co2_unchanged");
}

/**
 * 1つのメトリクス比較を表示用文字列に変換します。
 *
 * @param label - 表示名
 * @param comparison - 前後比較
 * @returns フォーマット済み文字列
 */
function formatComparisonLine(
  label: string,
  comparison: AirQualityMetricDelta,
): string {
  if (
    comparison.before === undefined ||
    comparison.after === undefined ||
    comparison.delta === undefined
  ) {
    return t("soracom.messages.air_quality_comparison_unavailable", { label });
  }

  return t("soracom.messages.air_quality_comparison_line", {
    label,
    before: formatMetricNumber(comparison.before),
    after: formatMetricNumber(comparison.after),
    delta: formatSignedMetricNumber(comparison.delta),
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

/**
 * 符号付き数値を表示向けに文字列化します。
 *
 * @param value - 表示対象の数値
 * @returns 文字列化された符号付き数値
 */
function formatSignedMetricNumber(value: number): string {
  const formatted = formatMetricNumber(Math.abs(value));
  if (value > 0) {
    return `+${formatted}`;
  }
  if (value < 0) {
    return `-${formatted}`;
  }
  return "0";
}

export default SlackFunction(
  VentilationEffectReviewFunctionDefinition,
  async ({ inputs, client }) => {
    try {
      const validImsi = imsiSchema.parse(inputs.imsi);
      const referenceTime = Date.parse(inputs.reference_time);
      const beforeMinutes = inputs.before_minutes ?? DEFAULT_BEFORE_MINUTES;
      const afterMinutes = inputs.after_minutes ?? DEFAULT_AFTER_MINUTES;
      const co2Threshold = inputs.co2_threshold ?? DEFAULT_CO2_THRESHOLD;

      if (
        !Number.isFinite(referenceTime) ||
        !Number.isFinite(beforeMinutes) ||
        beforeMinutes <= 0 ||
        !Number.isFinite(afterMinutes) ||
        afterMinutes <= 0 ||
        !Number.isFinite(co2Threshold) ||
        co2Threshold <= 0
      ) {
        throw new Error(t("errors.invalid_input"));
      }

      console.log(
        t("soracom.logs.generating_ventilation_effect_review", {
          imsi: validImsi,
          referenceTime: new Date(referenceTime).toISOString(),
        }),
      );

      const channelId = await getConfigValue(
        client,
        CONFIG_KEYS.REPORT_CHANNEL_ID,
        inputs.channel_id,
      );

      const beforeStartTime = referenceTime - beforeMinutes * 60 * 1000;
      const afterEndTime = referenceTime + afterMinutes * 60 * 1000;
      const soracomClient = createSoracomClientFromEnv();
      const result = await soracomClient.getHarvestData(
        validImsi,
        beforeStartTime,
        afterEndTime,
      );

      const beforeSummary = summarizeAirQualityEntries(
        filterAirQualityEntriesByTimeRange(
          result.entries,
          beforeStartTime,
          referenceTime,
        ),
        co2Threshold,
      );
      const afterSummary = summarizeAirQualityEntries(
        filterAirQualityEntriesByTimeRange(
          result.entries,
          referenceTime,
          afterEndTime,
        ),
        co2Threshold,
      );
      const comparison = compareAirQualitySummaries(
        beforeSummary,
        afterSummary,
      );
      const message = formatVentilationEffectReviewMessage(
        validImsi,
        referenceTime,
        beforeSummary,
        afterSummary,
        comparison,
        beforeMinutes,
        afterMinutes,
      );

      await client.chat.postMessage({
        channel: channelId,
        text: message,
      });

      return {
        outputs: {
          imsi: validImsi,
          before_sample_count: beforeSummary.sampleCount,
          after_sample_count: afterSummary.sampleCount,
          message,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("ventilation_effect_review error:", errorMessage);
      return { error: errorMessage };
    }
  },
);
