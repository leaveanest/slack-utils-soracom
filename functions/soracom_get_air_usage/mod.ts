import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { t } from "../../lib/i18n/mod.ts";
import {
  createSoracomClientFromEnv,
  formatBytes,
} from "../../lib/soracom/mod.ts";
import type { AirStatsDataPoint } from "../../lib/soracom/mod.ts";
import { imsiSchema, statsPeriodSchema } from "../../lib/validation/schemas.ts";

/**
 * Soracom Air通信量統計取得関数定義
 */
export const SoracomGetAirUsageFunctionDefinition = DefineFunction({
  callback_id: "soracom_get_air_usage",
  title: "SIM通信量統計",
  description: "SIM 回線の通信量統計を取得して表示します",
  source_file: "functions/soracom_get_air_usage/mod.ts",
  input_parameters: {
    properties: {
      imsi: {
        type: Schema.types.string,
        description: "加入者の IMSI（15 桁）",
      },
      period: {
        type: Schema.types.string,
        description: "集計期間（day または month）",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "結果を投稿するチャンネル",
      },
    },
    required: ["imsi", "period", "channel_id"],
  },
  output_parameters: {
    properties: {
      imsi: {
        type: Schema.types.string,
        description: "IMSI",
      },
      total_upload: {
        type: Schema.types.string,
        description: "総アップロード量（整形済み）",
      },
      total_download: {
        type: Schema.types.string,
        description: "総ダウンロード量（整形済み）",
      },
      message: {
        type: Schema.types.string,
        description: "整形済みの通信量統計メッセージ",
      },
    },
    required: ["imsi", "total_upload", "total_download", "message"],
  },
});

/**
 * 通信量統計データをフォーマットされたメッセージに変換します
 *
 * @param imsi - IMSI
 * @param period - 集計期間
 * @param dataPoints - 統計データポイント
 * @returns フォーマットされたSlackメッセージ文字列と集計情報
 */
export function formatAirUsageMessage(
  imsi: string,
  period: string,
  dataPoints: AirStatsDataPoint[],
): { message: string; totalUpload: number; totalDownload: number } {
  if (dataPoints.length === 0) {
    return {
      message: t("soracom.messages.no_stats_found"),
      totalUpload: 0,
      totalDownload: 0,
    };
  }

  const header = t("soracom.messages.air_usage_header", { imsi, period });

  let totalUpload = 0;
  let totalDownload = 0;

  const lines = dataPoints.map((dp) => {
    totalUpload += dp.uploadByteSizeTotal;
    totalDownload += dp.downloadByteSizeTotal;

    const date = new Date(
      dp.date < 1_000_000_000_000 ? dp.date * 1000 : dp.date,
    ).toISOString().split("T")[0];
    const upload = formatBytes(dp.uploadByteSizeTotal);
    const download = formatBytes(dp.downloadByteSizeTotal);

    return `${date}: ${
      t("soracom.messages.air_usage_upload", { bytes: upload })
    } / ${t("soracom.messages.air_usage_download", { bytes: download })}`;
  });

  const totalLine = t("soracom.messages.air_usage_total", {
    upload: formatBytes(totalUpload),
    download: formatBytes(totalDownload),
  });

  const message = `*${header}*\n\n${lines.join("\n")}\n\n*${totalLine}*`;

  return { message, totalUpload, totalDownload };
}

export default SlackFunction(
  SoracomGetAirUsageFunctionDefinition,
  async ({ inputs, client, env }) => {
    try {
      const validImsi = imsiSchema.parse(inputs.imsi);
      const validPeriod = statsPeriodSchema.parse(inputs.period) as
        | "day"
        | "month";

      console.log(
        t("soracom.logs.fetching_air_usage", { imsi: validImsi }),
      );

      const soracomClient = createSoracomClientFromEnv(env);

      // デフォルトで過去30日間のデータを取得
      const now = Math.floor(Date.now() / 1000);
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60;

      const result = await soracomClient.getAirUsage(
        validImsi,
        validPeriod,
        thirtyDaysAgo,
        now,
      );

      const { message, totalUpload, totalDownload } = formatAirUsageMessage(
        validImsi,
        validPeriod,
        result.dataPoints,
      );

      await client.chat.postMessage({
        channel: inputs.channel_id,
        text: message,
      });

      return {
        outputs: {
          imsi: validImsi,
          total_upload: formatBytes(totalUpload),
          total_download: formatBytes(totalDownload),
          message,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("soracom_get_air_usage error:", errorMessage);
      return { error: errorMessage };
    }
  },
);
