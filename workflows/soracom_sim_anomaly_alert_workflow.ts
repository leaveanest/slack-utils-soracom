import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SoracomSimAnomalyAlertFunctionDefinition } from "../functions/soracom_sim_anomaly_alert/mod.ts";

/**
 * SIM異常検知アラートワークフロー
 *
 * SIM一覧を取得し、異常ステータスのSIMを検出してチャンネルに警告を投稿します。
 */
const SoracomSimAnomalyAlertWorkflow = DefineWorkflow({
  callback_id: "soracom_sim_anomaly_alert_workflow",
  title: "SIM異常検知",
  description: "異常ステータスの SIM を検出して通知します",
  input_parameters: {
    properties: {
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "アラート投稿先チャンネル",
      },
    },
    required: ["channel_id"],
  },
});

SoracomSimAnomalyAlertWorkflow.addStep(
  SoracomSimAnomalyAlertFunctionDefinition,
  {
    channel_id: SoracomSimAnomalyAlertWorkflow.inputs.channel_id,
  },
);

export default SoracomSimAnomalyAlertWorkflow;
