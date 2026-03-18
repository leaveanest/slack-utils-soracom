import { DefineWorkflow } from "deno-slack-sdk/mod.ts";
import { Co2DailyAirQualityReportFunctionDefinition } from "../functions/co2_daily_air_quality_report/mod.ts";

/**
 * CO2日次空気品質レポートワークフロー
 *
 * Datastore に登録されたセンサー設定をもとに、
 * Slack に日次レポートと CO2 ピーク時間帯を投稿します。
 */
const Co2DailyAirQualityReportWorkflow = DefineWorkflow({
  callback_id: "co2_daily_air_quality_report_workflow",
  title: "CO2日次空気品質レポート",
  description:
    "登録済みセンサーの日次空気品質サマリーとCO2ピーク時間帯を生成します",
  input_parameters: {
    properties: {},
    required: [],
  },
});

Co2DailyAirQualityReportWorkflow.addStep(
  Co2DailyAirQualityReportFunctionDefinition,
  {},
);

export default Co2DailyAirQualityReportWorkflow;
