import { Trigger } from "deno-slack-sdk/types.ts";
import { TriggerContextData, TriggerTypes } from "deno-slack-api/mod.ts";
import SoracomListSoraCamDevicesWorkflow from "../workflows/soracom_list_soracam_devices_workflow.ts";

/**
 * ソラカメデバイス一覧取得トリガー
 *
 * ショートカットから起動し、ソラカメデバイスの一覧をチャンネルに投稿します。
 */
const SoracomListSoraCamDevicesTrigger: Trigger<
  typeof SoracomListSoraCamDevicesWorkflow.definition
> = {
  type: TriggerTypes.Shortcut,
  name: "SoraCam Device List",
  description: "Fetch SoraCam device list",
  workflow:
    `#/workflows/${SoracomListSoraCamDevicesWorkflow.definition.callback_id}`,
  inputs: {
    channel_id: {
      value: TriggerContextData.Shortcut.channel_id,
    },
  },
};

export default SoracomListSoraCamDevicesTrigger;
