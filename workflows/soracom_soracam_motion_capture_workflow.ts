import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SoracomSoraCamMotionCaptureFunctionDefinition } from "../functions/soracom_soracam_motion_capture/mod.ts";

/**
 * ソラカメ動体検知→画像キャプチャワークフロー
 *
 * 指定デバイスの動体検知イベントを取得し、
 * 検出されたイベント時刻の画像を自動エクスポートしてチャンネルに投稿します。
 */
const SoracomSoraCamMotionCaptureWorkflow = DefineWorkflow({
  callback_id: "soracom_soracam_motion_capture_workflow",
  title: "ソラカメ動体検知画像確認",
  description: "動体検知イベントを見つけ、録画から画像を切り出して共有します",
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

SoracomSoraCamMotionCaptureWorkflow.addStep(
  SoracomSoraCamMotionCaptureFunctionDefinition,
  {
    device_id: SoracomSoraCamMotionCaptureWorkflow.inputs.device_id,
    channel_id: SoracomSoraCamMotionCaptureWorkflow.inputs.channel_id,
  },
);

export default SoracomSoraCamMotionCaptureWorkflow;
