import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SoracomListSoraCamDevicesFunctionDefinition } from "../functions/soracom_list_soracam_devices/mod.ts";

/**
 * ソラカメデバイス一覧取得ワークフロー
 *
 * Slackショートカットから起動し、ソラカメデバイスの一覧をチャンネルに投稿します。
 */
const SoracomListSoraCamDevicesWorkflow = DefineWorkflow({
  callback_id: "soracom_list_soracam_devices_workflow",
  title: "SoraCam Device List",
  description: "Fetch and display SoraCam device list",
  input_parameters: {
    properties: {
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "Target channel",
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
