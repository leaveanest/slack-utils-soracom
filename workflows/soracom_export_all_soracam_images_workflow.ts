import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SoracomExportAllSoraCamImagesFunctionDefinition } from "../functions/soracom_export_all_soracam_images/mod.ts";

/**
 * 全ソラカメ画像エクスポートワークフロー
 *
 * Slackショートカットから起動し、全ソラカメデバイスの画像をまとめてチャンネルに投稿します。
 */
const SoracomExportAllSoraCamImagesWorkflow = DefineWorkflow({
  callback_id: "soracom_export_all_soracam_images_workflow",
  title: "SoraCam全台画像エクスポート",
  description: "すべての SoraCam デバイスから画像を切り出して共有します",
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

SoracomExportAllSoraCamImagesWorkflow.addStep(
  SoracomExportAllSoraCamImagesFunctionDefinition,
  {
    channel_id: SoracomExportAllSoraCamImagesWorkflow.inputs.channel_id,
  },
);

export default SoracomExportAllSoraCamImagesWorkflow;
