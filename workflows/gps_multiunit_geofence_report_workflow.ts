import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { GpsMultiunitGeofenceReportFunctionDefinition } from "../functions/gps_multiunit_geofence_report/mod.ts";

const GPS_MULTIUNIT_GEOFENCE_PERIOD_OPTIONS = ["1h", "1d"] as const;
const GPS_MULTIUNIT_GEOFENCE_PERIOD_CHOICES = [
  { value: "1h", title: "1時間", description: "直近1時間を集計" },
  { value: "1d", title: "1日", description: "直近1日を集計" },
] as const;

const GpsMultiunitGeofenceReportWorkflow = DefineWorkflow({
  callback_id: "gps_multiunit_geofence_report_workflow",
  title: "GPSマルチユニット ジオフェンス確認",
  description:
    "指定した SIM グループの最新位置が指定範囲内かどうかを確認します",
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
});

GpsMultiunitGeofenceReportWorkflow.addStep(
  GpsMultiunitGeofenceReportFunctionDefinition,
  {
    sim_group_id: GpsMultiunitGeofenceReportWorkflow.inputs.sim_group_id,
    channel_id: GpsMultiunitGeofenceReportWorkflow.inputs.channel_id,
    period: GpsMultiunitGeofenceReportWorkflow.inputs.period,
    center_latitude: GpsMultiunitGeofenceReportWorkflow.inputs.center_latitude,
    center_longitude:
      GpsMultiunitGeofenceReportWorkflow.inputs.center_longitude,
    radius_meters: GpsMultiunitGeofenceReportWorkflow.inputs.radius_meters,
  },
);

export default GpsMultiunitGeofenceReportWorkflow;
