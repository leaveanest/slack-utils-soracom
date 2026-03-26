import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { Co2DailyAirQualityReportFunctionDefinition } from "../functions/co2_daily_air_quality_report/mod.ts";

const AIR_QUALITY_REPORT_PERIOD_OPTIONS = ["1h", "1d", "1m"] as const;
const AIR_QUALITY_REPORT_PERIOD_CHOICES = [
  { value: "1h", title: "1時間", description: "直近1時間を集計" },
  { value: "1d", title: "1日", description: "直近1日を集計" },
  { value: "1m", title: "1ヶ月", description: "直近30日を集計" },
] as const;

/**
 * 空気品質レポートワークフロー
 *
 * 指定した SIM グループをもとに、
 * Slack に指定期間のレポートと CO2 ピーク時間帯を投稿します。
 */
const Co2DailyAirQualityReportWorkflow = DefineWorkflow({
  callback_id: "co2_daily_air_quality_report_workflow",
  title: "空気品質レポート",
  description:
    "指定した SIM グループの空気品質サマリーとCO2ピーク時間帯を生成します",
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
});

Co2DailyAirQualityReportWorkflow.addStep(
  Co2DailyAirQualityReportFunctionDefinition,
  {
    sim_group_id: Co2DailyAirQualityReportWorkflow.inputs.sim_group_id,
    channel_id: Co2DailyAirQualityReportWorkflow.inputs.channel_id,
    period: Co2DailyAirQualityReportWorkflow.inputs.period,
    co2_threshold: Co2DailyAirQualityReportWorkflow.inputs.co2_threshold,
    temperature_min: Co2DailyAirQualityReportWorkflow.inputs.temperature_min,
    temperature_max: Co2DailyAirQualityReportWorkflow.inputs.temperature_max,
    humidity_min: Co2DailyAirQualityReportWorkflow.inputs.humidity_min,
    humidity_max: Co2DailyAirQualityReportWorkflow.inputs.humidity_max,
  },
);

export default Co2DailyAirQualityReportWorkflow;
