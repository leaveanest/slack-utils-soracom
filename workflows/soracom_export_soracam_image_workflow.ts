import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SoracomExportSoraCamImageFunctionDefinition } from "../functions/soracom_export_soracam_image/mod.ts";

/**
 * ソラカメ画像エクスポートワークフロー
 *
 * Slackショートカットから起動し、指定デバイスの録画から画像をエクスポートしてチャンネルに投稿します。
 */
const SoracomExportSoraCamImageWorkflow = DefineWorkflow({
  callback_id: "soracom_export_soracam_image_workflow",
  title: "SoraCam Image Export",
  description: "Export an image from a SoraCam device recording",
  input_parameters: {
    properties: {
      device_id: {
        type: Schema.types.string,
        description: "SoraCam device ID",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "Target channel",
      },
    },
    required: ["device_id", "channel_id"],
  },
});

SoracomExportSoraCamImageWorkflow.addStep(
  SoracomExportSoraCamImageFunctionDefinition,
  {
    device_id: SoracomExportSoraCamImageWorkflow.inputs.device_id,
    channel_id: SoracomExportSoraCamImageWorkflow.inputs.channel_id,
  },
);

export default SoracomExportSoraCamImageWorkflow;
