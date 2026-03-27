import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SoracomGetHarvestDataFunctionDefinition } from "../functions/soracom_get_harvest_data/mod.ts";

/**
 * Soracom Harvest Data取得ワークフロー
 *
 * Slackショートカットから起動し、指定したIMSIのHarvestデータをチャンネルに投稿します。
 */
const SoracomGetHarvestDataWorkflow = DefineWorkflow({
  callback_id: "soracom_get_harvest_data_workflow",
  title: "SORACOM Harvest Data確認",
  description: "加入者の Harvest Data を取得して表示します",
  input_parameters: {
    properties: {
      imsi: {
        type: Schema.types.string,
        description: "加入者の IMSI（15 桁）",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "対象チャンネル",
      },
    },
    required: ["imsi", "channel_id"],
  },
});

SoracomGetHarvestDataWorkflow.addStep(
  SoracomGetHarvestDataFunctionDefinition,
  {
    imsi: SoracomGetHarvestDataWorkflow.inputs.imsi,
    channel_id: SoracomGetHarvestDataWorkflow.inputs.channel_id,
  },
);

export default SoracomGetHarvestDataWorkflow;
