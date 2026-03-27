import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { t } from "../../lib/i18n/mod.ts";
import { createSoracomClientFromEnv } from "../../lib/soracom/mod.ts";
import type { SoraCamEvent } from "../../lib/soracom/mod.ts";
import { soraCamDeviceIdSchema } from "../../lib/validation/schemas.ts";

/**
 * ソラカメイベント取得関数定義
 */
export const SoracomGetSoraCamEventsFunctionDefinition = DefineFunction({
  callback_id: "soracom_get_soracam_events",
  title: "ソラカメイベント",
  description: "ソラカメ デバイスのイベントを取得して表示します",
  source_file: "functions/soracom_get_soracam_events/mod.ts",
  input_parameters: {
    properties: {
      device_id: {
        type: Schema.types.string,
        description: "ソラカメ デバイス ID",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "結果を投稿するチャンネル",
      },
    },
    required: ["device_id", "channel_id"],
  },
  output_parameters: {
    properties: {
      device_id: {
        type: Schema.types.string,
        description: "デバイス ID",
      },
      event_count: {
        type: Schema.types.number,
        description: "取得したイベント数",
      },
      message: {
        type: Schema.types.string,
        description: "整形済みのイベントメッセージ",
      },
    },
    required: ["device_id", "event_count", "message"],
  },
});

/**
 * ソラカメイベントをフォーマットされたメッセージに変換します
 *
 * @param deviceId - デバイスID
 * @param events - イベント一覧
 * @returns フォーマットされたSlackメッセージ文字列
 */
export function formatSoraCamEventsMessage(
  deviceId: string,
  events: SoraCamEvent[],
): string {
  if (events.length === 0) {
    return t("soracom.messages.soracam_no_events");
  }

  const header = t("soracom.messages.soracam_events_header", {
    deviceId,
    count: events.length,
  });

  const eventLines = events.map((event) => {
    const time = new Date(event.eventTime).toISOString();
    return [
      `  ${
        t("soracom.messages.soracam_event_type", { type: event.eventType })
      }`,
      `  ${t("soracom.messages.soracam_event_time", { time })}`,
    ].join("\n");
  });

  return `*${header}*\n\n${eventLines.join("\n\n")}`;
}

export default SlackFunction(
  SoracomGetSoraCamEventsFunctionDefinition,
  async ({ inputs, client, env }) => {
    try {
      const validDeviceId = soraCamDeviceIdSchema.parse(inputs.device_id);

      console.log(
        t("soracom.logs.fetching_soracam_events", {
          deviceId: validDeviceId,
        }),
      );

      const soracomClient = createSoracomClientFromEnv(env);

      // デフォルトで過去24時間のイベントを取得
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;

      const events = await soracomClient.getSoraCamEvents(
        validDeviceId,
        oneDayAgo,
        now,
      );

      const message = formatSoraCamEventsMessage(validDeviceId, events);

      await client.chat.postMessage({
        channel: inputs.channel_id,
        text: message,
      });

      return {
        outputs: {
          device_id: validDeviceId,
          event_count: events.length,
          message,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("soracom_get_soracam_events error:", errorMessage);
      return { error: errorMessage };
    }
  },
);
