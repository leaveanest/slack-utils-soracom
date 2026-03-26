import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SoracomGetAirUsageFunctionDefinition } from "../functions/soracom_get_air_usage/mod.ts";

/**
 * Soracom Air通信量統計取得ワークフロー
 *
 * Slackショートカットから起動し、指定したサブスクライバーの通信量統計をチャンネルに投稿します。
 */
const SoracomGetAirUsageWorkflow = DefineWorkflow({
  callback_id: "soracom_get_air_usage_workflow",
  title: "SIM通信量統計",
  description: "SIM 回線の通信量統計を取得して表示します",
  input_parameters: {
    properties: {
      imsi: {
        type: Schema.types.string,
        description: "加入者の IMSI（15 桁）",
      },
      period: {
        type: Schema.types.string,
        description: "集計期間（day または month）",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "対象チャンネル",
      },
    },
    required: ["imsi", "period", "channel_id"],
  },
});

SoracomGetAirUsageWorkflow.addStep(SoracomGetAirUsageFunctionDefinition, {
  imsi: SoracomGetAirUsageWorkflow.inputs.imsi,
  period: SoracomGetAirUsageWorkflow.inputs.period,
  channel_id: SoracomGetAirUsageWorkflow.inputs.channel_id,
});

export default SoracomGetAirUsageWorkflow;
