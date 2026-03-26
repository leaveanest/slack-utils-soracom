import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SoracomListSoraCamDevicesFunctionDefinition } from "../functions/soracom_list_soracam_devices/mod.ts";

/**
 * カメラデバイス一覧取得ワークフロー
 *
 * Slackショートカットから起動し、ソラカメデバイスの一覧をチャンネルに投稿します。
 */
const SoracomListSoraCamDevicesWorkflow = DefineWorkflow({
  callback_id: "soracom_list_soracam_devices_workflow",
  title: "カメラデバイス一覧",
  description: "カメラデバイス一覧を取得して表示します",
  input_parameters: {
    properties: {
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "対象チャンネル",
      },
    },
    required: ["channel_id"],
  },
});

SoracomListSoraCamDevicesWorkflow.addStep(
  SoracomListSoraCamDevicesFunctionDefinition,
  {
    channel_id: SoracomListSoraCamDevicesWorkflow.inputs.channel_id,
  },
);

export default SoracomListSoraCamDevicesWorkflow;
