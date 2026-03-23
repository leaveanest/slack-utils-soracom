import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { Co2DailyAirQualityReportFunctionDefinition } from "../functions/co2_daily_air_quality_report/mod.ts";

/**
 * 日次空気品質レポートワークフロー
 *
 * 指定した SIM グループをもとに、
 * Slack に日次レポートと CO2 ピーク時間帯を投稿します。
 */
const Co2DailyAirQualityReportWorkflow = DefineWorkflow({
  callback_id: "co2_daily_air_quality_report_workflow",
  title: "日次空気品質レポート",
  description:
    "指定した SIM グループの日次空気品質サマリーとCO2ピーク時間帯を生成します",
  input_parameters: {
    properties: {
      sim_group_id: {
        type: Schema.types.string,
        description: "対象の SIM グループ ID",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "レポート投稿先チャンネル",
      },
      co2_threshold: {
        type: Schema.types.number,
        description: "CO2 しきい値（ppm）",
      },
      temperature_min: {
        type: Schema.types.number,
        description: "温度下限しきい値（C）",
      },
      temperature_max: {
        type: Schema.types.number,
        description: "温度上限しきい値（C）",
      },
      humidity_min: {
        type: Schema.types.number,
        description: "湿度下限しきい値（%）",
      },
      humidity_max: {
        type: Schema.types.number,
        description: "湿度上限しきい値（%）",
      },
    },
    required: ["sim_group_id", "channel_id"],
  },
});

Co2DailyAirQualityReportWorkflow.addStep(
  Co2DailyAirQualityReportFunctionDefinition,
  {
    sim_group_id: Co2DailyAirQualityReportWorkflow.inputs.sim_group_id,
    channel_id: Co2DailyAirQualityReportWorkflow.inputs.channel_id,
    co2_threshold: Co2DailyAirQualityReportWorkflow.inputs.co2_threshold,
    temperature_min: Co2DailyAirQualityReportWorkflow.inputs.temperature_min,
    temperature_max: Co2DailyAirQualityReportWorkflow.inputs.temperature_max,
    humidity_min: Co2DailyAirQualityReportWorkflow.inputs.humidity_min,
    humidity_max: Co2DailyAirQualityReportWorkflow.inputs.humidity_max,
  },
);

export default Co2DailyAirQualityReportWorkflow;
