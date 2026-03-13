import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { t } from "../../lib/i18n/mod.ts";
import { createSoracomClientFromEnv } from "../../lib/soracom/mod.ts";
import type { SoraCamImageExport } from "../../lib/soracom/mod.ts";
import { soraCamDeviceIdSchema } from "../../lib/validation/schemas.ts";

/**
 * ソラカメ画像エクスポート関数定義
 */
export const SoracomExportSoraCamImageFunctionDefinition = DefineFunction({
  callback_id: "soracom_export_soracam_image",
  title: "SoraCam Image Export",
  description:
    "Export an image from a SoraCam device recording and post the result",
  source_file: "functions/soracom_export_soracam_image/mod.ts",
  input_parameters: {
    properties: {
      device_id: {
        type: Schema.types.string,
        description: "SoraCam device ID",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "Channel to post results",
      },
    },
    required: ["device_id", "channel_id"],
  },
  output_parameters: {
    properties: {
      device_id: {
        type: Schema.types.string,
        description: "Device ID",
      },
      export_id: {
        type: Schema.types.string,
        description: "Export ID",
      },
      status: {
        type: Schema.types.string,
        description: "Export status",
      },
      image_url: {
        type: Schema.types.string,
        description: "Exported image URL (if completed)",
      },
      message: {
        type: Schema.types.string,
        description: "Formatted export result message",
      },
    },
    required: ["device_id", "export_id", "status", "message"],
  },
});

/**
 * ソラカメ画像エクスポート結果をフォーマットされたメッセージに変換します
 *
 * @param deviceId - デバイスID
 * @param exportResult - エクスポート結果
 * @returns フォーマットされたSlackメッセージ文字列
 */
export function formatSoraCamImageExportMessage(
  deviceId: string,
  exportResult: SoraCamImageExport,
): string {
  const lines = [
    t("soracom.messages.soracam_image_export_requested", { deviceId }),
    t("soracom.messages.soracam_image_export_status", {
      status: exportResult.status,
    }),
  ];

  if (exportResult.status === "completed" && exportResult.url) {
    lines.push(
      t("soracom.messages.soracam_image_export_url", {
        url: exportResult.url,
      }),
    );
  } else if (exportResult.status === "processing") {
    lines.push(
      t("soracom.messages.soracam_image_export_processing", {
        exportId: exportResult.exportId,
      }),
    );
  }

  return lines.join("\n");
}

export default SlackFunction(
  SoracomExportSoraCamImageFunctionDefinition,
  async ({ inputs, client }) => {
    try {
      const validDeviceId = soraCamDeviceIdSchema.parse(inputs.device_id);

      console.log(
        t("soracom.logs.exporting_soracam_image", {
          deviceId: validDeviceId,
        }),
      );

      const soracomClient = createSoracomClientFromEnv();

      // 現在時刻のスナップショットをエクスポート
      const exportResult = await soracomClient.exportSoraCamImage(
        validDeviceId,
        Date.now(),
      );

      // エクスポートが完了するまで少し待機して結果を取得
      let finalResult = exportResult;
      if (exportResult.status === "processing") {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        finalResult = await soracomClient.getSoraCamImageExport(
          validDeviceId,
          exportResult.exportId,
        );
      }

      const message = formatSoraCamImageExportMessage(
        validDeviceId,
        finalResult,
      );

      await client.chat.postMessage({
        channel: inputs.channel_id,
        text: message,
      });

      return {
        outputs: {
          device_id: validDeviceId,
          export_id: finalResult.exportId,
          status: finalResult.status,
          image_url: finalResult.url || "",
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
