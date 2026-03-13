import { Trigger } from "deno-slack-sdk/types.ts";
import { TriggerContextData, TriggerTypes } from "deno-slack-api/mod.ts";
import SoracomGetHarvestDataWorkflow from "../workflows/soracom_get_harvest_data_workflow.ts";

/**
 * Soracom Harvest Data取得トリガー
 *
 * ショートカットから起動し、指定IMSIのHarvestデータをチャンネルに投稿します。
 */
const SoracomGetHarvestDataTrigger: Trigger<
  typeof SoracomGetHarvestDataWorkflow.definition
> = {
  type: TriggerTypes.Shortcut,
  name: "Soracom Harvest Data",
  description: "Fetch Harvest Data for a subscriber",
  workflow:
    `#/workflows/${SoracomGetHarvestDataWorkflow.definition.callback_id}`,
  inputs: {
    imsi: {
      value: "",
      customizable: true,
    },
    channel_id: {
      value: TriggerContextData.Shortcut.channel_id,
    },
  },
};

export default SoracomGetHarvestDataTrigger;
