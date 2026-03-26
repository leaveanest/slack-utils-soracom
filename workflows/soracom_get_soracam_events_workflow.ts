import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SoracomGetSoraCamEventsFunctionDefinition } from "../functions/soracom_get_soracam_events/mod.ts";

/**
 * カメライベント取得ワークフロー
 *
 * Slackショートカットから起動し、指定デバイスのイベント（動体・音声検出）をチャンネルに投稿します。
 */
const SoracomGetSoraCamEventsWorkflow = DefineWorkflow({
  callback_id: "soracom_get_soracam_events_workflow",
  title: "カメライベント",
  description: "カメラデバイスのイベントを取得して表示します",
  input_parameters: {
    properties: {
      device_id: {
        type: Schema.types.string,
        description: "カメラデバイス ID",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "対象チャンネル",
      },
    },
    required: ["device_id", "channel_id"],
  },
});

SoracomGetSoraCamEventsWorkflow.addStep(
  SoracomGetSoraCamEventsFunctionDefinition,
  {
    device_id: SoracomGetSoraCamEventsWorkflow.inputs.device_id,
    channel_id: SoracomGetSoraCamEventsWorkflow.inputs.channel_id,
  },
);

export default SoracomGetSoraCamEventsWorkflow;
