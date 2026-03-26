import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { t } from "../../lib/i18n/mod.ts";
import { createSoracomClientFromEnv } from "../../lib/soracom/mod.ts";
import type { HarvestDataEntry } from "../../lib/soracom/mod.ts";
import { imsiSchema } from "../../lib/validation/schemas.ts";

/**
 * Soracom Harvest Data取得関数定義
 */
export const SoracomGetHarvestDataFunctionDefinition = DefineFunction({
  callback_id: "soracom_get_harvest_data",
  title: "SORACOM Harvest Data確認",
  description: "加入者の Harvest Data を取得して表示します",
  source_file: "functions/soracom_get_harvest_data/mod.ts",
  input_parameters: {
    properties: {
      imsi: {
        type: Schema.types.string,
        description: "加入者の IMSI（15 桁）",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "結果を投稿するチャンネル",
      },
    },
    required: ["imsi", "channel_id"],
  },
  output_parameters: {
    properties: {
      imsi: {
        type: Schema.types.string,
        description: "IMSI",
      },
      entry_count: {
        type: Schema.types.number,
        description: "取得したデータ件数",
      },
      message: {
        type: Schema.types.string,
        description: "整形済みの Harvest Data メッセージ",
      },
    },
    required: ["imsi", "entry_count", "message"],
  },
});

/**
 * Harvest Dataエントリをフォーマットされたメッセージに変換します
 *
 * @param imsi - IMSI
 * @param entries - Harvest Dataエントリ一覧
 * @returns フォーマットされたSlackメッセージ文字列
 */
export function formatHarvestDataMessage(
  imsi: string,
  entries: HarvestDataEntry[],
): string {
  if (entries.length === 0) {
    return t("soracom.messages.harvest_no_data");
  }

  const header = t("soracom.messages.harvest_data_header", {
    imsi,
    count: entries.length,
  });

  const lines = entries.slice(0, 20).map((entry) => {
    const time = new Date(entry.time).toISOString();
    const content = JSON.stringify(entry.content);
    return t("soracom.messages.harvest_data_entry", { time, content });
  });

  return `*${header}*\n\n${lines.join("\n")}`;
}

export default SlackFunction(
  SoracomGetHarvestDataFunctionDefinition,
  async ({ inputs, client, env }) => {
    try {
      const validImsi = imsiSchema.parse(inputs.imsi);

      console.log(t("soracom.logs.fetching_harvest_data", { imsi: validImsi }));

      const soracomClient = createSoracomClientFromEnv(env);

      // デフォルトで過去24時間のデータを取得
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;

      const result = await soracomClient.getHarvestData(
        validImsi,
        oneDayAgo,
        now,
      );

      const message = formatHarvestDataMessage(validImsi, result.entries);

      await client.chat.postMessage({
        channel: inputs.channel_id,
        text: message,
      });

      return {
        outputs: {
          imsi: validImsi,
          entry_count: result.entries.length,
          message,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("soracom_get_harvest_data error:", errorMessage);
      return { error: errorMessage };
    }
  },
);
