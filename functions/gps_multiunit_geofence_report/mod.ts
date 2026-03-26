import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { formatLocalizedDateTime, t } from "../../lib/i18n/mod.ts";
import {
  buildGpsMultiunitGoogleMapsUrl,
  calculateGpsMultiunitDistanceMeters,
  createSoracomClientFromEnv,
  extractGpsMultiunitSamples,
  findLatestGpsMultiunitSample,
  hasGpsMultiunitLocation,
  isGpsMultiunitDeviceIssue,
  isGpsMultiunitWithinGeofence,
} from "../../lib/soracom/mod.ts";
import {
  channelIdSchema,
  gpsMultiunitPeriodSchema,
  imsiSchema,
  latitudeSchema,
  longitudeSchema,
  nonEmptyStringSchema,
  radiusMetersSchema,
} from "../../lib/validation/schemas.ts";
import {
  filterGpsMultiunitTargetSims,
  maskGpsMultiunitImsiForDisplay,
  resolveGpsMultiunitSensorName,
} from "../gps_multiunit_report/mod.ts";

const GPS_MULTIUNIT_GEOFENCE_PERIOD_OPTIONS = ["1h", "1d"] as const;
type GpsMultiunitGeofencePeriod =
  typeof GPS_MULTIUNIT_GEOFENCE_PERIOD_OPTIONS[number];
const GPS_MULTIUNIT_GEOFENCE_PERIOD_CHOICES = [
  { value: "1h", title: "1時間", description: "直近1時間を集計" },
  { value: "1d", title: "1日", description: "直近1日を集計" },
] as const;

type GpsMultiunitGeofenceReportInputs = {
  sim_group_id: string;
  channel_id: string;
  period: string;
  center_latitude: number;
  center_longitude: number;
  radius_meters: number;
};

export type GpsMultiunitGeofenceStatus = "inside" | "outside" | "no_gps";

export type GpsMultiunitGeofenceResult = {
  sensorName: string;
  imsi: string;
  status: GpsMultiunitGeofenceStatus;
  sampleTime?: number;
  distanceMeters?: number;
  latitude?: number;
  longitude?: number;
  deviceIssue: boolean;
  noData: boolean;
};

/**
 * GPSマルチユニット ジオフェンス確認関数定義
 *
 * 指定した SIM グループ配下の active SIM について、
 * 最新位置がジオフェンス内かどうかを判定して共有します。
 */
export const GpsMultiunitGeofenceReportFunctionDefinition = DefineFunction({
  callback_id: "gps_multiunit_geofence_report",
  title: "GPSマルチユニット ジオフェンス確認",
  description:
    "指定した SIM グループの最新位置が指定範囲内かどうかを確認します",
  source_file: "functions/gps_multiunit_geofence_report/mod.ts",
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
        description: "確認結果の投稿先チャンネル",
      },
      period: {
        type: Schema.types.string,
        title: "集計期間",
        description: "集計期間を選択してください（既定値: 1時間）",
        enum: GPS_MULTIUNIT_GEOFENCE_PERIOD_OPTIONS,
        choices: GPS_MULTIUNIT_GEOFENCE_PERIOD_CHOICES,
        default: "1h",
      },
      center_latitude: {
        type: Schema.types.number,
        title: "中心緯度",
        description: "ジオフェンス中心の緯度",
      },
      center_longitude: {
        type: Schema.types.number,
        title: "中心経度",
        description: "ジオフェンス中心の経度",
      },
      radius_meters: {
        type: Schema.types.number,
        title: "半径（m）",
        description: "ジオフェンス半径（メートル）",
      },
    },
    required: [
      "sim_group_id",
      "channel_id",
      "period",
      "center_latitude",
      "center_longitude",
      "radius_meters",
    ],
  },
  output_parameters: {
    properties: {
      processed_count: {
        type: Schema.types.number,
        title: "処理対象SIM数",
        description: "処理した SIM 数",
      },
      inside_count: {
        type: Schema.types.number,
        title: "範囲内SIM数",
        description: "範囲内の SIM 数",
      },
      outside_count: {
        type: Schema.types.number,
        title: "範囲外SIM数",
        description: "範囲外の SIM 数",
      },
      no_gps_count: {
        type: Schema.types.number,
        title: "GPS未取得SIM数",
        description: "GPS を取得できなかった SIM 数",
      },
      failed_count: {
        type: Schema.types.number,
        title: "取得失敗件数",
        description: "取得に失敗した件数",
      },
      has_outside: {
        type: Schema.types.boolean,
        title: "範囲外あり",
        description: "範囲外の SIM があるかどうか",
      },
      message: {
        type: Schema.types.string,
        title: "投稿メッセージ",
        description: "投稿メッセージ",
      },
    },
    required: [
      "processed_count",
      "inside_count",
      "outside_count",
      "no_gps_count",
      "failed_count",
      "has_outside",
      "message",
    ],
  },
});

/**
 * ジオフェンス結果を集計します。
 *
 * @param results - ジオフェンス結果
 * @returns 件数集計
 */
export function summarizeGpsMultiunitGeofenceResults(
  results: GpsMultiunitGeofenceResult[],
): {
  insideCount: number;
  outsideCount: number;
  noGpsCount: number;
  hasOutside: boolean;
} {
  const insideCount = results.filter((result) => result.status === "inside")
    .length;
  const outsideCount = results.filter((result) => result.status === "outside")
    .length;
  const noGpsCount = results.filter((result) => result.status === "no_gps")
    .length;

  return {
    insideCount,
    outsideCount,
    noGpsCount,
    hasOutside: outsideCount > 0,
  };
}

/**
 * GPSマルチユニット ジオフェンス確認メッセージを生成します。
 *
 * @param simGroupId - 対象 SIM グループ ID
 * @param period - 集計期間
 * @param centerLatitude - 中心緯度
 * @param centerLongitude - 中心経度
 * @param radiusMeters - 半径メートル
 * @param results - ジオフェンス結果
 * @param failedCount - 取得失敗件数
 * @returns フォーマット済みメッセージ
 */
export function formatGpsMultiunitGeofenceReportMessage(
  simGroupId: string,
  period: GpsMultiunitGeofencePeriod,
  centerLatitude: number,
  centerLongitude: number,
  radiusMeters: number,
  results: GpsMultiunitGeofenceResult[],
  failedCount: number,
): string {
  const summary = summarizeGpsMultiunitGeofenceResults(results);

  return [
    t("soracom.messages.gps_multiunit_geofence_header", {
      groupId: simGroupId,
      period: formatGpsMultiunitGeofencePeriodLabel(period),
    }),
    t("soracom.messages.gps_multiunit_geofence_center", {
      latitude: formatCoordinate(centerLatitude),
      longitude: formatCoordinate(centerLongitude),
      radius: formatMetricNumber(radiusMeters),
    }),
    t("soracom.messages.gps_multiunit_geofence_summary", {
      processed: results.length,
      inside: summary.insideCount,
      outside: summary.outsideCount,
      noGps: summary.noGpsCount,
      failed: failedCount,
    }),
    results.map((result) => formatGeofenceResult(result)).join("\n\n"),
  ].join("\n\n");
}

function formatGeofenceResult(result: GpsMultiunitGeofenceResult): string {
  const lines = [
    t("soracom.messages.gps_multiunit_geofence_sensor_header", {
      sensorName: result.sensorName,
      imsi: result.imsi,
    }),
    ...toBulletLines([
      t("soracom.messages.gps_multiunit_geofence_status_line", {
        status: formatGeofenceStatusLabel(result.status),
      }),
      ...formatGeofenceActionLines(result),
      ...formatSampleTimeLines(result.sampleTime, result.noData),
      ...formatDistanceLines(result.distanceMeters),
      ...formatLocationLines(result),
      ...formatDeviceIssueLines(result.deviceIssue),
    ]),
  ];

  return lines.join("\n");
}

function formatSampleTimeLines(
  sampleTime: number | undefined,
  noData: boolean,
): string[] {
  if (noData) {
    return [t("soracom.messages.gps_multiunit_geofence_no_data")];
  }

  if (sampleTime === undefined) {
    return [];
  }

  return [
    t("soracom.messages.gps_multiunit_sample_time", {
      time: formatLocalizedDateTime(sampleTime),
    }),
  ];
}

function formatGeofenceActionLines(
  result: GpsMultiunitGeofenceResult,
): string[] {
  return [
    t("soracom.messages.gps_multiunit_geofence_action_line", {
      action: `*${resolveGeofenceActionMessage(result)}*`,
    }),
  ];
}

function formatDistanceLines(distanceMeters?: number): string[] {
  return distanceMeters === undefined ? [] : [
    t("soracom.messages.gps_multiunit_geofence_distance", {
      distance: formatMetricNumber(distanceMeters),
    }),
  ];
}

function formatLocationLines(result: GpsMultiunitGeofenceResult): string[] {
  if (result.latitude === undefined || result.longitude === undefined) {
    return [t("soracom.messages.gps_multiunit_location_missing")];
  }

  return [
    t("soracom.messages.gps_multiunit_location_available", {
      url: buildGpsMultiunitGoogleMapsUrl(result.latitude, result.longitude),
      label: t("soracom.messages.gps_multiunit_google_maps"),
      latitude: formatCoordinate(result.latitude),
      longitude: formatCoordinate(result.longitude),
    }),
  ];
}

function formatDeviceIssueLines(hasDeviceIssue: boolean): string[] {
  return hasDeviceIssue
    ? [t("soracom.messages.gps_multiunit_device_issue_warning")]
    : [];
}

function formatGeofenceStatusLabel(status: GpsMultiunitGeofenceStatus): string {
  switch (status) {
    case "inside":
      return t("soracom.messages.gps_multiunit_geofence_status_inside");
    case "outside":
      return t("soracom.messages.gps_multiunit_geofence_status_outside");
    case "no_gps":
      return t("soracom.messages.gps_multiunit_geofence_status_no_gps");
  }
}

function resolveGeofenceActionMessage(
  result: GpsMultiunitGeofenceResult,
): string {
  if (result.noData) {
    return t("soracom.messages.gps_multiunit_geofence_action_no_data");
  }

  switch (result.status) {
    case "inside":
      return t("soracom.messages.gps_multiunit_geofence_action_inside");
    case "outside":
      return t("soracom.messages.gps_multiunit_geofence_action_outside");
    case "no_gps":
      return t("soracom.messages.gps_multiunit_geofence_action_no_gps");
  }
}

function toBulletLines(lines: string[]): string[] {
  return lines.map((line) => `- ${line}`);
}

function buildMarkdownBlocks(text: string): Array<Record<string, unknown>> {
  return text
    .split(/\n{2,}/)
    .filter((section) => section.trim().length > 0)
    .map((section) => ({
      type: "section",
      text: {
        type: "mrkdwn",
        text: section,
      },
    }));
}

function formatGpsMultiunitGeofencePeriodLabel(
  period: GpsMultiunitGeofencePeriod,
): string {
  switch (period) {
    case "1h":
      return t("soracom.messages.air_quality_report_period_1h");
    case "1d":
      return t("soracom.messages.air_quality_report_period_1d");
  }
}

function resolveGpsMultiunitGeofenceLookbackMs(
  period: GpsMultiunitGeofencePeriod,
): number {
  switch (period) {
    case "1h":
      return 60 * 60 * 1000;
    case "1d":
      return 24 * 60 * 60 * 1000;
  }
}

function formatMetricNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(1);
}

function formatCoordinate(value: number): string {
  return value.toFixed(6);
}

export default SlackFunction(
  GpsMultiunitGeofenceReportFunctionDefinition,
  async ({ inputs, client, env }) => {
    try {
      const {
        sim_group_id: simGroupIdRaw,
        channel_id: channelIdRaw,
        period: periodRaw,
        center_latitude: centerLatitudeRaw,
        center_longitude: centerLongitudeRaw,
        radius_meters: radiusMetersRaw,
      } = inputs as GpsMultiunitGeofenceReportInputs;

      const simGroupId = nonEmptyStringSchema.parse(
        typeof simGroupIdRaw === "string" ? simGroupIdRaw.trim() : "",
      );
      const channelId = channelIdSchema.parse(channelIdRaw);
      const period = gpsMultiunitPeriodSchema.parse(
        periodRaw,
      ) as GpsMultiunitGeofencePeriod;
      const centerLatitude = latitudeSchema.parse(centerLatitudeRaw);
      const centerLongitude = longitudeSchema.parse(centerLongitudeRaw);
      const radiusMeters = radiusMetersSchema.parse(radiusMetersRaw);

      console.log(
        t("soracom.logs.checking_gps_multiunit_geofence", {
          groupId: simGroupId,
          period: formatGpsMultiunitGeofencePeriodLabel(period),
        }),
      );

      const now = Date.now();
      const lookbackStart = now - resolveGpsMultiunitGeofenceLookbackMs(period);
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

      const targetSims = filterGpsMultiunitTargetSims(simsInGroup, simGroupId);
      if (targetSims.length === 0) {
        throw new Error(
          t("soracom.errors.sim_group_active_sims_not_found", {
            groupId: simGroupId,
            count: simsInGroup.length,
          }),
        );
      }

      const results: GpsMultiunitGeofenceResult[] = [];
      let failedCount = 0;

      for (const sim of targetSims) {
        try {
          const imsi = imsiSchema.parse(sim.imsi);

          console.log(
            t("soracom.logs.checking_gps_multiunit_geofence_sim", {
              imsi,
            }),
          );

          const harvestData = await soracomClient.getHarvestData(
            imsi,
            lookbackStart,
            now,
          );
          const latestSample = findLatestGpsMultiunitSample(
            extractGpsMultiunitSamples(harvestData.entries),
          );
          const baseResult = {
            sensorName: resolveGpsMultiunitSensorName(sim),
            imsi: maskGpsMultiunitImsiForDisplay(imsi),
            deviceIssue: latestSample !== null &&
              isGpsMultiunitDeviceIssue(latestSample),
          };

          if (latestSample === null) {
            results.push({
              ...baseResult,
              status: "no_gps",
              noData: true,
            });
            continue;
          }

          if (!hasGpsMultiunitLocation(latestSample)) {
            results.push({
              ...baseResult,
              status: "no_gps",
              sampleTime: latestSample.time,
              noData: false,
            });
            continue;
          }

          const distanceMeters = calculateGpsMultiunitDistanceMeters(
            latestSample.latitude!,
            latestSample.longitude!,
            centerLatitude,
            centerLongitude,
          );
          const status = isGpsMultiunitWithinGeofence(
              latestSample.latitude!,
              latestSample.longitude!,
              centerLatitude,
              centerLongitude,
              radiusMeters,
            )
            ? "inside"
            : "outside";

          results.push({
            ...baseResult,
            status,
            sampleTime: latestSample.time,
            distanceMeters,
            latitude: latestSample.latitude,
            longitude: latestSample.longitude,
            noData: false,
          });
        } catch (error) {
          failedCount += 1;
          const errorMessage = error instanceof Error
            ? error.message
            : String(error);
          console.error(
            `gps_multiunit_geofence_report sim error (${
              sim.imsi || sim.simId
            }):`,
            errorMessage,
          );
        }
      }

      if (results.length === 0) {
        throw new Error(t("soracom.errors.gps_multiunit_geofence_all_failed"));
      }

      const message = formatGpsMultiunitGeofenceReportMessage(
        simGroupId,
        period,
        centerLatitude,
        centerLongitude,
        radiusMeters,
        results,
        failedCount,
      );

      const response = await client.chat.postMessage({
        channel: channelId,
        text: message,
        blocks: buildMarkdownBlocks(message),
      });

      if (!response.ok) {
        throw new Error(
          t("errors.api_call_failed", {
            error: response.error ?? "chat.postMessage_failed",
          }),
        );
      }

      const summary = summarizeGpsMultiunitGeofenceResults(results);

      return {
        outputs: {
          processed_count: targetSims.length,
          inside_count: summary.insideCount,
          outside_count: summary.outsideCount,
          no_gps_count: summary.noGpsCount,
          failed_count: failedCount,
          has_outside: summary.hasOutside,
          message,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("gps_multiunit_geofence_report error:", errorMessage);
      return { error: errorMessage };
    }
  },
);
