import { Trigger } from "deno-slack-sdk/types.ts";
import { TriggerContextData, TriggerTypes } from "deno-slack-api/mod.ts";
import SoracomUpdateConfigWorkflow from "../workflows/soracom_update_config_workflow.ts";

/**
 * Soracom設定更新トリガー（ショートカット）
 *
 * ショートカットから起動し、モーダルフォームで設定を更新します。
 * チャンネル内で「Soracom Config」を選択すると設定画面が開きます。
 */
const SoracomUpdateConfigTrigger: Trigger<
  typeof SoracomUpdateConfigWorkflow.definition
> = {
  type: TriggerTypes.Shortcut,
  name: "Soracom Config",
  description: "Configure Soracom notification channels",
  workflow:
    `#/workflows/${SoracomUpdateConfigWorkflow.definition.callback_id}`,
  inputs: {
    interactivity: {
      value: TriggerContextData.Shortcut.interactivity,
    },
    channel_id: {
      value: TriggerContextData.Shortcut.channel_id,
    },
    user_id: {
      value: TriggerContextData.Shortcut.user_id,
    },
  },
};

export default SoracomUpdateConfigTrigger;
