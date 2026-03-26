import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SoracomSimUsageReportFunctionDefinition } from "../functions/soracom_sim_usage_report/mod.ts";

const STATS_PERIOD_OPTIONS = ["day", "month"] as const;

/**
 * SIM通信量サマリーレポートワークフロー
 *
 * 全SIMの通信量統計を取得し、サマリーレポートをチャンネルに投稿します。
 */
const SoracomSimUsageReportWorkflow = DefineWorkflow({
  callback_id: "soracom_sim_usage_report_workflow",
  title: "SIM通信量レポート",
  description: "全 SIM の通信量レポートを生成して共有します",
  input_parameters: {
    properties: {
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "レポート投稿先チャンネル",
      },
      period: {
        type: Schema.types.string,
        description: "集計期間（day または month）",
        enum: STATS_PERIOD_OPTIONS,
      },
    },
    required: ["channel_id", "period"],
  },
});

SoracomSimUsageReportWorkflow.addStep(
  SoracomSimUsageReportFunctionDefinition,
  {
    channel_id: SoracomSimUsageReportWorkflow.inputs.channel_id,
    period: SoracomSimUsageReportWorkflow.inputs.period,
  },
);

export default SoracomSimUsageReportWorkflow;
