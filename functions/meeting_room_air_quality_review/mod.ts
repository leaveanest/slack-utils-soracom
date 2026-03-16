import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { t } from "../../lib/i18n/mod.ts";
import {
  bucketAirQualityEntries,
  CONFIG_KEYS,
  createSoracomClientFromEnv,
  findPeakCo2Bucket,
  getConfigValue,
  summarizeAirQualityEntries,
} from "../../lib/soracom/mod.ts";
import type {
  AirQualityBucketSummary,
  AirQualityMetricSummary,
  AirQualitySummary,
} from "../../lib/soracom/mod.ts";
import { imsiSchema } from "../../lib/validation/schemas.ts";

const DEFAULT_CO2_THRESHOLD = 1000;
const DEFAULT_BUCKET_MINUTES = 60;

/**
 * 会議室空気品質振り返り関数定義
 *
 * 直近24時間の Harvest Data から CO2 のピーク時間帯を抽出し、
 * 会議室センサーの振り返りメッセージを Slack に投稿します。
 */
export const MeetingRoomAirQualityReviewFunctionDefinition = DefineFunction({
  callback_id: "meeting_room_air_quality_review",
  title: "Meeting Room Air Quality Review",
  description:
    "Review daily meeting room air quality and highlight the peak CO2 window",
  source_file: "functions/meeting_room_air_quality_review/mod.ts",
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
      co2_threshold: {
        type: Schema.types.number,
        description: "CO2 alert threshold in ppm",
      },
      bucket_minutes: {
        type: Schema.types.number,
        description: "Bucket size in minutes for peak time analysis",
      },
    },
    required: ["imsi", "channel_id"],
  },
  output_parameters: {
    properties: {
      imsi: {
        type: Schema.types.string,
        description: "IMSI",
      },
      sample_count: {
        type: Schema.types.number,
        description: "Number of air quality samples summarized",
      },
      peak_start_time: {
        type: Schema.types.string,
        description: "Peak CO2 window start time in ISO 8601",
      },
      peak_end_time: {
        type: Schema.types.string,
        description: "Peak CO2 window end time in ISO 8601",
      },
      message: {
        type: Schema.types.string,
        description: "Formatted meeting room review message",
      },
    },
    required: [
      "imsi",
      "sample_count",
      "peak_start_time",
      "peak_end_time",
      "message",
    ],
  },
});

/**
 * 会議室空気品質振り返りメッセージを生成します。
 *
 * @param imsi - IMSI
 * @param summary - 日次空気品質サマリー
 * @param peakBucket - CO2ピーク時間帯
 * @returns フォーマット済みメッセージ
 */
export function formatMeetingRoomAirQualityReviewMessage(
  imsi: string,
  summary: AirQualitySummary,
  peakBucket: AirQualityBucketSummary | null,
): string {
  const header = `*${
    t("soracom.messages.meeting_room_air_quality_review_header", { imsi })
  }*`;

  if (summary.sampleCount === 0 || peakBucket === null) {
    return [
      header,
      t("soracom.messages.meeting_room_air_quality_review_no_data"),
    ].join("\n\n");
  }

  return [
    header,
    t("soracom.messages.air_quality_sample_count", {
      count: summary.sampleCount,
    }),
    t("soracom.messages.air_quality_threshold_exceeded", {
      threshold: formatMetricNumber(summary.co2Threshold),
      count: summary.co2ThresholdExceededCount,
    }),
    t("soracom.messages.meeting_room_air_quality_review_peak_window", {
      start: new Date(peakBucket.startTime).toISOString(),
      end: new Date(peakBucket.endTime).toISOString(),
    }),
    peakBucket.summary.co2.average !== undefined
      ? t("soracom.messages.meeting_room_air_quality_review_peak_co2", {
        value: formatMetricNumber(peakBucket.summary.co2.average),
      })
      : t("soracom.messages.meeting_room_air_quality_review_peak_co2_missing"),
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

export default SlackFunction(
  MeetingRoomAirQualityReviewFunctionDefinition,
  async ({ inputs, client }) => {
    try {
      const validImsi = imsiSchema.parse(inputs.imsi);
      const co2Threshold = inputs.co2_threshold ?? DEFAULT_CO2_THRESHOLD;
      const bucketMinutes = inputs.bucket_minutes ?? DEFAULT_BUCKET_MINUTES;

      if (
        !Number.isFinite(co2Threshold) ||
        co2Threshold <= 0 ||
        !Number.isFinite(bucketMinutes) ||
        bucketMinutes <= 0
      ) {
        throw new Error(t("errors.invalid_input"));
      }

      console.log(
        t("soracom.logs.generating_meeting_room_air_quality_review", {
          imsi: validImsi,
        }),
      );

      const channelId = await getConfigValue(
        client,
        CONFIG_KEYS.REPORT_CHANNEL_ID,
        inputs.channel_id,
      );

      const soracomClient = createSoracomClientFromEnv();
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const result = await soracomClient.getHarvestData(
        validImsi,
        oneDayAgo,
        now,
      );

      const summary = summarizeAirQualityEntries(result.entries, co2Threshold);
      const peakBucket = findPeakCo2Bucket(
        bucketAirQualityEntries(
          result.entries,
          bucketMinutes * 60 * 1000,
          co2Threshold,
        ),
      );
      const message = formatMeetingRoomAirQualityReviewMessage(
        validImsi,
        summary,
        peakBucket,
      );

      await client.chat.postMessage({
        channel: channelId,
        text: message,
      });

      return {
        outputs: {
          imsi: validImsi,
          sample_count: summary.sampleCount,
          peak_start_time: peakBucket
            ? new Date(peakBucket.startTime).toISOString()
            : "",
          peak_end_time: peakBucket
            ? new Date(peakBucket.endTime).toISOString()
            : "",
          message,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("meeting_room_air_quality_review error:", errorMessage);
      return { error: errorMessage };
    }
  },
);
