import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { t } from "../../lib/i18n/mod.ts";
import { createSoracomClientFromEnv } from "../../lib/soracom/mod.ts";
import type { SoraCamDevice } from "../../lib/soracom/mod.ts";

/**
 * ソラカメデバイス一覧取得関数定義
 */
export const SoracomListSoraCamDevicesFunctionDefinition = DefineFunction({
  callback_id: "soracom_list_soracam_devices",
  title: "SoraCam Device List",
  description: "Fetch a list of SoraCam devices",
  source_file: "functions/soracom_list_soracam_devices/mod.ts",
  input_parameters: {
    properties: {
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "Channel to post results",
      },
    },
    required: ["channel_id"],
  },
  output_parameters: {
    properties: {
      device_count: {
        type: Schema.types.number,
        description: "Number of devices returned",
      },
      message: {
        type: Schema.types.string,
        description: "Formatted device list message",
      },
    },
    required: ["device_count", "message"],
  },
});

/**
 * ソラカメデバイス一覧をフォーマットされたメッセージに変換します
 *
 * @param devices - ソラカメデバイス一覧
 * @returns フォーマットされたSlackメッセージ文字列
 */
export function formatSoraCamDeviceListMessage(
  devices: SoraCamDevice[],
): string {
  if (devices.length === 0) {
    return t("soracom.messages.soracam_no_devices");
  }

  const header = t("soracom.messages.soracam_device_list_header", {
    count: devices.length,
  });

  const deviceLines = devices.map((device) => {
    const lastConnected = device.lastConnectedTime
      ? new Date(device.lastConnectedTime).toISOString()
      : "-";

    return [
      `*${device.name || device.deviceId}*`,
      `  ID: ${device.deviceId}`,
      `  ${t("soracom.messages.soracam_device_status", { status: device.status })}`,
      `  ${t("soracom.messages.soracam_device_firmware", { version: device.firmwareVersion || "-" })}`,
      `  ${t("soracom.messages.soracam_device_last_connected", { time: lastConnected })}`,
    ].join("\n");
  });

  return `*${header}*\n\n${deviceLines.join("\n\n")}`;
}

export default SlackFunction(
  SoracomListSoraCamDevicesFunctionDefinition,
  async ({ inputs, client }) => {
    try {
      console.log(t("soracom.logs.fetching_soracam_devices"));

      const soracomClient = createSoracomClientFromEnv();
      const devices = await soracomClient.listSoraCamDevices();

      const message = formatSoraCamDeviceListMessage(devices);

      await client.chat.postMessage({
        channel: inputs.channel_id,
        text: message,
      });

      return {
        outputs: {
          device_count: devices.length,
          message,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("soracom_list_soracam_devices error:", errorMessage);
      return { error: errorMessage };
    }
  },
);
