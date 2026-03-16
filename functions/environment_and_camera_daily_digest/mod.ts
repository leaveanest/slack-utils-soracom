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
  SoraCamEvent,
} from "../../lib/soracom/mod.ts";

const DEFAULT_CO2_THRESHOLD = 1000;
const DEFAULT_LOOKBACK_HOURS = 24;

/**
 * 環境とカメラの日次ダイジェスト関数定義
 */
export const EnvironmentAndCameraDailyDigestFunctionDefinition = DefineFunction(
  {
    callback_id: "environment_and_camera_daily_digest",
    title: "Environment And Camera Daily Digest",
    description:
      "Summarize daily air quality and SoraCam activity for stored sensor profiles",
    source_file: "functions/environment_and_camera_daily_digest/mod.ts",
    input_parameters: {
      properties: {},
      required: [],
    },
    output_parameters: {
      properties: {
        processed_count: {
          type: Schema.types.number,
          description: "Number of camera-linked profiles processed",
        },
        reported_count: {
          type: Schema.types.number,
          description: "Number of digests posted",
        },
        failed_count: {
          type: Schema.types.number,
          description: "Number of failed digests",
        },
        message: {
          type: Schema.types.string,
          description: "Execution summary",
        },
      },
      required: [
        "processed_count",
        "reported_count",
        "failed_count",
        "message",
      ],
    },
  },
);

/**
 * 環境とカメラの日次ダイジェストメッセージを生成します。
 *
 * @param sensorName - センサー表示名
 * @param imsi - IMSI
 * @param deviceId - SoraCam device ID
 * @param summary - Air quality summary
 * @param events - SoraCam events
 * @returns フォーマット済みメッセージ
 */
export function formatEnvironmentAndCameraDailyDigestMessage(
  sensorName: string,
  imsi: string,
  deviceId: string,
  summary: AirQualitySummary,
  events: SoraCamEvent[],
): string {
  const header = `*${
    t("soracom.messages.environment_and_camera_daily_digest_header", {
      sensorName,
      imsi,
      deviceId,
    })
  }*`;

  const sections = [header];

  if (summary.sampleCount === 0) {
    sections.push(
      t("soracom.messages.environment_and_camera_daily_digest_no_air_quality"),
    );
  } else {
    sections.push(
      t("soracom.messages.air_quality_sample_count", {
        count: summary.sampleCount,
      }),
    );
    sections.push(
      t("soracom.messages.air_quality_threshold_exceeded", {
        threshold: formatMetricNumber(summary.co2Threshold),
        count: summary.co2ThresholdExceededCount,
      }),
    );
    sections.push(
      formatMetricSummaryLine(
        t("soracom.messages.air_quality_metric_co2"),
        summary.co2,
      ),
    );
    sections.push(
      formatMetricSummaryLine(
        t("soracom.messages.air_quality_metric_temperature"),
        summary.temperature,
      ),
    );
    sections.push(
      formatMetricSummaryLine(
        t("soracom.messages.air_quality_metric_humidity"),
        summary.humidity,
      ),
    );
  }

  if (events.length === 0) {
    sections.push(
      t("soracom.messages.environment_and_camera_daily_digest_no_camera_events"),
    );
  } else {
    sections.push(
      t("soracom.messages.environment_and_camera_daily_digest_event_count", {
        count: events.length,
      }),
    );
    sections.push(
      t("soracom.messages.environment_and_camera_daily_digest_last_event", {
        time: new Date(events[0].eventTime).toISOString(),
        type: events[0].eventType,
      }),
    );
    sections.push(
      t(
        "soracom.messages.environment_and_camera_daily_digest_event_breakdown",
        {
          breakdown: formatEventBreakdown(events),
        },
      ),
    );
  }

  return sections.join("\n");
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
 * イベント種別ごとの件数を文字列化します。
 *
 * @param events - SoraCam events
 * @returns イベント種別の集計文字列
 */
function formatEventBreakdown(events: SoraCamEvent[]): string {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.eventType, (counts.get(event.eventType) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, count]) => `${type}:${count}`)
    .join(", ");
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
  EnvironmentAndCameraDailyDigestFunctionDefinition,
  async ({ client }) => {
    try {
      console.log(t("soracom.logs.loading_sensor_profiles"));

      const profiles = (await listSensorProfiles(client)).filter((profile) =>
        profile.soraCamDeviceId !== undefined
      );
      if (profiles.length === 0) {
        throw new Error(t("soracom.errors.camera_sensor_profiles_not_found"));
      }

      const soracomClient = createSoracomClientFromEnv();
      let reportedCount = 0;
      let failedCount = 0;

      for (const profile of profiles) {
        try {
          const co2Threshold = profile.co2Threshold ?? DEFAULT_CO2_THRESHOLD;
          const lookbackHours = profile.lookbackHours ?? DEFAULT_LOOKBACK_HOURS;

          if (
            !Number.isFinite(co2Threshold) ||
            co2Threshold <= 0 ||
            !Number.isFinite(lookbackHours) ||
            lookbackHours <= 0 ||
            profile.soraCamDeviceId === undefined
          ) {
            throw new Error(t("errors.invalid_input"));
          }

          console.log(
            t("soracom.logs.generating_environment_and_camera_daily_digest", {
              imsi: profile.imsi,
              deviceId: profile.soraCamDeviceId,
            }),
          );

          const now = Date.now();
          const lookbackStart = now - lookbackHours * 60 * 60 * 1000;

          const [harvest, events] = await Promise.all([
            soracomClient.getHarvestData(profile.imsi, lookbackStart, now),
            soracomClient.getSoraCamEvents(
              profile.soraCamDeviceId,
              lookbackStart,
              now,
            ),
          ]);

          const summary = summarizeAirQualityEntries(
            harvest.entries,
            co2Threshold,
          );
          const sortedEvents = [...events].sort((left, right) =>
            right.eventTime - left.eventTime
          );
          const message = formatEnvironmentAndCameraDailyDigestMessage(
            profile.sensorName,
            profile.imsi,
            profile.soraCamDeviceId,
            summary,
            sortedEvents,
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
            `environment_and_camera_daily_digest profile error (${profile.imsi}):`,
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
      console.error("environment_and_camera_daily_digest error:", errorMessage);
      return { error: errorMessage };
    }
  },
);
