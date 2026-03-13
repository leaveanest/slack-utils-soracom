import { Trigger } from "deno-slack-sdk/types.ts";
import { TriggerContextData, TriggerTypes } from "deno-slack-api/mod.ts";
import SoracomExportSoraCamImageWorkflow from "../workflows/soracom_export_soracam_image_workflow.ts";

/**
 * ソラカメ画像エクスポートトリガー
 *
 * ショートカットから起動し、指定デバイスの録画から画像をエクスポートしてチャンネルに投稿します。
 */
const SoracomExportSoraCamImageTrigger: Trigger<
  typeof SoracomExportSoraCamImageWorkflow.definition
> = {
  type: TriggerTypes.Shortcut,
  name: "SoraCam Image Export",
  description: "Export an image from a SoraCam device",
  workflow:
    `#/workflows/${SoracomExportSoraCamImageWorkflow.definition.callback_id}`,
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

export default SoracomExportSoraCamImageTrigger;
