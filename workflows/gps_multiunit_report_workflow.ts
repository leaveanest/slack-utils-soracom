import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { GpsMultiunitReportFunctionDefinition } from "../functions/gps_multiunit_report/mod.ts";

const GPS_MULTIUNIT_REPORT_PERIOD_OPTIONS = ["1h", "1d"] as const;
const GPS_MULTIUNIT_REPORT_PERIOD_CHOICES = [
  { value: "1h", title: "1時間", description: "直近1時間を集計" },
  { value: "1d", title: "1日", description: "直近1日を集計" },
] as const;

const GpsMultiunitReportWorkflow = DefineWorkflow({
  callback_id: "gps_multiunit_report_workflow",
  title: "GPSマルチユニットレポート",
  description:
    "指定した SIM グループの GPS マルチユニットの温湿度と位置情報を集計します",
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
        description: "レポート投稿先チャンネル",
      },
      period: {
        type: Schema.types.string,
        title: "集計期間",
        description: "集計期間を選択してください（既定値: 1時間）",
        enum: GPS_MULTIUNIT_REPORT_PERIOD_OPTIONS,
        choices: GPS_MULTIUNIT_REPORT_PERIOD_CHOICES,
        default: "1h",
      },
      sample_count: {
        type: Schema.types.number,
        title: "表示サンプル数",
        description: "1 は最新 1 点、2 以上は期間を等分した平均（既定値: 1）",
        default: 1,
      },
    },
    required: ["sim_group_id", "channel_id", "period"],
  },
});

GpsMultiunitReportWorkflow.addStep(
  GpsMultiunitReportFunctionDefinition,
  {
    sim_group_id: GpsMultiunitReportWorkflow.inputs.sim_group_id,
    channel_id: GpsMultiunitReportWorkflow.inputs.channel_id,
    period: GpsMultiunitReportWorkflow.inputs.period,
    sample_count: GpsMultiunitReportWorkflow.inputs.sample_count,
  },
);

export default GpsMultiunitReportWorkflow;
