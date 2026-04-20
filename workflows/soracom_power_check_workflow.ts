import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SoracomPowerCheckFunctionDefinition } from "../functions/soracom_power_check/mod.ts";

/**
 * SORACOM 電力チェックワークフロー
 *
 * Slackショートカットから起動し、指定した SIM グループ内の対象 SIM の
 * 最新電力系メトリクスをチャンネルに投稿します。
 */
const SoracomPowerCheckWorkflow = DefineWorkflow({
  callback_id: "soracom_power_check_workflow",
  title: "SORACOM 電力チェック",
  description:
    "SIM グループ内の対象 SIM について、最新の電力系メトリクスを確認します",
  input_parameters: {
    properties: {
      sim_group_id: {
        type: Schema.types.string,
        description: "対象の SIM グループ ID",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "結果を投稿するチャンネル",
      },
      tag_name: {
        type: Schema.types.string,
        description: "対象 SIM を `tag.name` の部分一致で絞り込みます",
      },
    },
    required: ["sim_group_id", "channel_id", "tag_name"],
  },
});

SoracomPowerCheckWorkflow.addStep(
  SoracomPowerCheckFunctionDefinition,
  {
    sim_group_id: SoracomPowerCheckWorkflow.inputs.sim_group_id,
    channel_id: SoracomPowerCheckWorkflow.inputs.channel_id,
    tag_name: SoracomPowerCheckWorkflow.inputs.tag_name,
  },
);

export default SoracomPowerCheckWorkflow;
