import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { t } from "../../lib/i18n/mod.ts";
import { createSoracomClientFromEnv } from "../../lib/soracom/mod.ts";
import type { SoracomSim } from "../../lib/soracom/mod.ts";
import { CONFIG_KEYS, getConfigValue } from "../../lib/soracom/datastore.ts";

/** 異常とみなすSIMステータス一覧 */
const ANOMALY_STATUSES = ["suspended", "terminated", "deactivated"];

/**
 * SIM異常検知アラート関数定義
 *
 * SIM一覧を取得し、異常ステータスのSIMを検出してSlackチャンネルに警告を投稿します。
 */
export const SoracomSimAnomalyAlertFunctionDefinition = DefineFunction({
  callback_id: "soracom_sim_anomaly_alert",
  title: "SIM異常検知",
  description: "異常ステータスの SIM を検出して通知します",
  source_file: "functions/soracom_sim_anomaly_alert/mod.ts",
  input_parameters: {
    properties: {
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "アラートを投稿するチャンネル",
      },
    },
    required: ["channel_id"],
  },
  output_parameters: {
    properties: {
      anomaly_count: {
        type: Schema.types.number,
        description: "検出した異常 SIM 数",
      },
      total_count: {
        type: Schema.types.number,
        description: "確認した SIM の総数",
      },
      message: {
        type: Schema.types.string,
        description: "アラートメッセージ",
      },
    },
    required: ["anomaly_count", "total_count", "message"],
  },
});

/**
 * 異常SIMをフィルタリングします
 *
 * @param sims - SIM一覧
 * @returns 異常ステータスのSIM一覧
 */
export function filterAnomalousSims(sims: SoracomSim[]): SoracomSim[] {
  return sims.filter((sim) =>
    ANOMALY_STATUSES.includes(sim.status.toLowerCase())
  );
}

/**
 * SIM異常検知アラートメッセージを生成します
 *
 * @param anomalousSims - 異常ステータスのSIM一覧
 * @param totalCount - 全SIM数
 * @returns フォーマットされたアラートメッセージ
 */
export function formatAnomalyAlertMessage(
  anomalousSims: SoracomSim[],
  totalCount: number,
): string {
  if (anomalousSims.length === 0) {
    return t("soracom.messages.sim_anomaly_none", { total: totalCount });
  }

  const header = t("soracom.messages.sim_anomaly_header", {
    count: anomalousSims.length,
    total: totalCount,
  });

  const simLines = anomalousSims.map((sim) => {
    const name = sim.tags?.name || sim.simId;
    return [
      `  :warning: *${name}*`,
      `    ${t("soracom.messages.sim_imsi", { imsi: sim.imsi || "-" })}`,
      `    ${t("soracom.messages.sim_status", { status: sim.status })}`,
      `    ${
        t("soracom.messages.sim_speed_class", { speedClass: sim.speedClass })
      }`,
    ].join("\n");
  });

  return `*${header}*\n\n${simLines.join("\n\n")}`;
}

export default SlackFunction(
  SoracomSimAnomalyAlertFunctionDefinition,
  async ({ inputs, client, env }) => {
    try {
      console.log(t("soracom.logs.checking_sim_anomaly"));

      // Datastoreからチャンネルを解決（フォールバック: トリガーで指定された値）
      const channelId = await getConfigValue(
        client,
        CONFIG_KEYS.ALERT_CHANNEL_ID,
        inputs.channel_id,
        env,
      );

      const soracomClient = createSoracomClientFromEnv(env);
      const result = await soracomClient.listSims(100);

      const anomalousSims = filterAnomalousSims(result.sims);
      const message = formatAnomalyAlertMessage(
        anomalousSims,
        result.sims.length,
      );

      // 異常がある場合のみ投稿（正常時もオプションで通知可能）
      await client.chat.postMessage({
        channel: channelId,
        text: message,
      });

      return {
        outputs: {
          anomaly_count: anomalousSims.length,
          total_count: result.sims.length,
          message,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("soracom_sim_anomaly_alert error:", errorMessage);
      return { error: errorMessage };
    }
  },
);
