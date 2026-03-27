import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SoracomExportSoraCamImageFunctionDefinition } from "../functions/soracom_export_soracam_image/mod.ts";

/**
 * ソラカメ画像スナップショットワークフロー
 *
 * Slackショートカットから起動し、指定デバイスの録画から画像スナップショットを取得してチャンネルに投稿します。
 */
const SoracomExportSoraCamImageWorkflow = DefineWorkflow({
  callback_id: "soracom_export_soracam_image_workflow",
  title: "ソラカメ画像スナップショット",
  description: "ソラカメ 録画から画像スナップショットを取得して共有します",
  input_parameters: {
    properties: {
      device_id: {
        type: Schema.types.string,
        description: "ソラカメ デバイス ID",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "対象チャンネル",
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
