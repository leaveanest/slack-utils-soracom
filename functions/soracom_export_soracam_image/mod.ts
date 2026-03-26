import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { t } from "../../lib/i18n/mod.ts";
import {
  type SlackApiClient,
  uploadSlackFileToChannel,
} from "../../lib/slack/file_upload.ts";
import {
  buildSoraCamSnapshotFileName,
  buildSoraCamSnapshotTitle,
  captureSoraCamSnapshot,
  createSoracomClientFromEnv,
  formatSoraCamImageExportReport,
  type SoraCamDevice,
  type SoraCamImageExportReportResult,
} from "../../lib/soracom/mod.ts";
import { soraCamDeviceIdSchema } from "../../lib/validation/schemas.ts";

/**
 * ソラカメ画像スナップショット関数定義
 */
export const SoracomExportSoraCamImageFunctionDefinition = DefineFunction({
  callback_id: "soracom_export_soracam_image",
  title: "ソラカメ画像スナップショット",
  description:
    "ソラカメ 録画から画像スナップショットを取得して結果を共有します",
  source_file: "functions/soracom_export_soracam_image/mod.ts",
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
      export_id: {
        type: Schema.types.string,
        description: "エクスポート ID",
      },
      status: {
        type: Schema.types.string,
        description: "スナップショット状態",
      },
      image_url: {
        type: Schema.types.string,
        description: "エクスポート画像 URL（完了時）",
      },
      message: {
        type: Schema.types.string,
        description: "整形済みのスナップショット結果メッセージ",
      },
    },
    required: ["device_id", "export_id", "status", "message"],
  },
});

/**
 * 単体デバイスの表示用結果です。
 */
export type SoraCamSingleImageExportResult = SoraCamImageExportReportResult;

function buildSingleDeviceResult(
  device: SoraCamDevice | undefined,
  deviceId: string,
  exportId: string,
  imageUrl: string,
  snapshotTime: number,
  slackFileId: string,
): SoraCamSingleImageExportResult {
  return {
    deviceId,
    deviceName: device?.name || deviceId,
    exportId,
    status: "uploaded",
    imageUrl,
    snapshotTime,
    slackFileId,
  };
}

/**
 * ソラカメ画像スナップショット結果をフォーマットされたメッセージに変換します。
 *
 * @param result - 単体デバイスのスナップショット結果
 * @returns フォーマットされたSlackメッセージ文字列
 */
export function formatSoraCamImageExportMessage(
  result: SoraCamSingleImageExportResult,
): string {
  return formatSoraCamImageExportReport(
    t("soracom.messages.soracam_single_image_export_header"),
    [result],
  );
}

export default SlackFunction(
  SoracomExportSoraCamImageFunctionDefinition,
  async ({ inputs, client, env }) => {
    try {
      const validDeviceId = soraCamDeviceIdSchema.parse(inputs.device_id);

      console.log(
        t("soracom.logs.exporting_soracam_image", {
          deviceId: validDeviceId,
        }),
      );

      const soracomClient = createSoracomClientFromEnv(env);
      const devices = await soracomClient.listSoraCamDevices();
      const targetDevice = devices.find((device) =>
        device.deviceId === validDeviceId
      );
      const snapshot = await captureSoraCamSnapshot(
        soracomClient,
        validDeviceId,
      );
      const slackFileId = await uploadSlackFileToChannel(
        client as unknown as SlackApiClient,
        inputs.channel_id,
        snapshot.snapshotBytes,
        {
          filename: buildSoraCamSnapshotFileName(
            validDeviceId,
            snapshot.snapshotTime,
          ),
          title: buildSoraCamSnapshotTitle(
            targetDevice?.name || validDeviceId,
            snapshot.snapshotTime,
          ),
          contentType: "image/jpeg",
        },
      );

      const result = buildSingleDeviceResult(
        targetDevice,
        validDeviceId,
        snapshot.exportId,
        snapshot.imageUrl,
        snapshot.snapshotTime,
        slackFileId,
      );
      const message = formatSoraCamImageExportMessage(result);

      const postResponse = await client.chat.postMessage({
        channel: inputs.channel_id,
        text: message,
      });
      if (!postResponse.ok) {
        throw new Error(
          t("errors.api_call_failed", {
            error: postResponse.error ?? "chat.postMessage_failed",
          }),
        );
      }

      return {
        outputs: {
          device_id: validDeviceId,
          export_id: snapshot.exportId,
          status: result.status,
          image_url: snapshot.imageUrl,
          message,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("soracom_export_soracam_image error:", errorMessage);
      return { error: errorMessage };
    }
  },
);
