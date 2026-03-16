import { DefineWorkflow } from "deno-slack-sdk/mod.ts";
import { Co2DailyAirQualityReportFunctionDefinition } from "../functions/co2_daily_air_quality_report/mod.ts";

/**
 * CO2日次空気品質レポートワークフロー
 *
 * Datastore に登録されたセンサー設定をもとに、
 * Slack に日次レポートを投稿します。
 */
const Co2DailyAirQualityReportWorkflow = DefineWorkflow({
  callback_id: "co2_daily_air_quality_report_workflow",
  title: "CO2 Daily Air Quality Report",
  description: "Generate daily summaries for configured CO2 sensors",
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
