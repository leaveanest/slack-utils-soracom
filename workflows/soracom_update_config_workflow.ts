import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SoracomUpdateConfigFunctionDefinition } from "../functions/soracom_update_config/mod.ts";

/**
 * Soracom設定更新ワークフロー
 *
 * ショートカットから起動し、モーダルフォームで設定キーとチャンネルを選択して
 * Datastoreに保存します。
 */
const SoracomUpdateConfigWorkflow = DefineWorkflow({
  callback_id: "soracom_update_config_workflow",
  title: "Soracom Update Config",
  description: "Update Soracom configuration values via modal form",
  input_parameters: {
    properties: {
      interactivity: {
        type: Schema.slack.types.interactivity,
        description: "Interactivity context for opening form",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "Channel where the shortcut was invoked",
      },
      user_id: {
        type: Schema.slack.types.user_id,
        description: "User who triggered the workflow",
      },
    },
    required: ["interactivity", "channel_id", "user_id"],
  },
});

// Step 1: モーダルフォームを開く
const formStep = SoracomUpdateConfigWorkflow.addStep(
  Schema.slack.functions.OpenForm,
  {
    title: "Soracom設定",
    submit_label: "保存",
    description: "通知先チャンネルを設定します",
    interactivity: SoracomUpdateConfigWorkflow.inputs.interactivity,
    fields: {
      required: ["config_key", "config_value"],
      elements: [
        {
          name: "config_key",
          title: "設定キー",
          type: Schema.types.string,
          enum: [
            "alert_channel_id",
            "report_channel_id",
            "soracam_channel_id",
          ],
        },
        {
          name: "config_value",
          title: "通知先チャンネル",
          type: Schema.slack.types.channel_id,
        },
      ],
    },
  },
);

// Step 2: Datastoreに保存
SoracomUpdateConfigWorkflow.addStep(
  SoracomUpdateConfigFunctionDefinition,
  {
    config_key: formStep.outputs.fields.config_key,
    config_value: formStep.outputs.fields.config_value,
    channel_id: SoracomUpdateConfigWorkflow.inputs.channel_id,
    user_id: SoracomUpdateConfigWorkflow.inputs.user_id,
  },
);

export default SoracomUpdateConfigWorkflow;
