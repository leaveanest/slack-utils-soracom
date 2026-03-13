import { Trigger } from "deno-slack-sdk/types.ts";
import { TriggerContextData, TriggerTypes } from "deno-slack-api/mod.ts";
import SoracomGetSoraCamEventsWorkflow from "../workflows/soracom_get_soracam_events_workflow.ts";

/**
 * ソラカメイベント取得トリガー
 *
 * ショートカットから起動し、指定デバイスのイベント（動体・音声検出）をチャンネルに投稿します。
 */
const SoracomGetSoraCamEventsTrigger: Trigger<
  typeof SoracomGetSoraCamEventsWorkflow.definition
> = {
  type: TriggerTypes.Shortcut,
  name: "SoraCam Events",
  description: "Fetch SoraCam events for a device",
  workflow:
    `#/workflows/${SoracomGetSoraCamEventsWorkflow.definition.callback_id}`,
  inputs: {
    device_id: {
      value: "",
      customizable: true,
    },
    channel_id: {
      value: TriggerContextData.Shortcut.channel_id,
    },
  },
};

export default SoracomGetSoraCamEventsTrigger;
