import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SoracomExportAllSoraCamImagesFunctionDefinition } from "../functions/soracom_export_all_soracam_images/mod.ts";

/**
 * 全ソラカメ画像スナップショットワークフロー
 *
 * Slackショートカットから起動し、全ソラカメデバイスの画像スナップショットをまとめてチャンネルに投稿します。
 */
const SoracomExportAllSoraCamImagesWorkflow = DefineWorkflow({
  callback_id: "soracom_export_all_soracam_images_workflow",
  title: "ソラカメ全台画像スナップショット",
  description:
    "すべての ソラカメ デバイスから画像スナップショットを取得して共有します",
  input_parameters: {
    properties: {
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "対象チャンネル",
      },
      job_key: {
        type: Schema.types.string,
        description: "内部用ジョブキー",
      },
      task_key: {
        type: Schema.types.string,
        description: "内部用タスクキー",
      },
    },
    required: ["channel_id"],
  },
});

SoracomExportAllSoraCamImagesWorkflow.addStep(
  SoracomExportAllSoraCamImagesFunctionDefinition,
  {
    channel_id: SoracomExportAllSoraCamImagesWorkflow.inputs.channel_id,
    job_key: SoracomExportAllSoraCamImagesWorkflow.inputs.job_key,
    task_key: SoracomExportAllSoraCamImagesWorkflow.inputs.task_key,
  },
);

export default SoracomExportAllSoraCamImagesWorkflow;
