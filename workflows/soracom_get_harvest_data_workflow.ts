import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SoracomGetHarvestDataFunctionDefinition } from "../functions/soracom_get_harvest_data/mod.ts";

/**
 * Soracom Harvest Data取得ワークフロー
 *
 * Slackショートカットから起動し、指定したIMSIのHarvestデータをチャンネルに投稿します。
 */
const SoracomGetHarvestDataWorkflow = DefineWorkflow({
  callback_id: "soracom_get_harvest_data_workflow",
  title: "Soracom Harvest Data",
  description: "Fetch and display Harvest Data for a subscriber",
  input_parameters: {
    properties: {
      imsi: {
        type: Schema.types.string,
        description: "IMSI of the subscriber (15 digits)",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "Target channel",
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
