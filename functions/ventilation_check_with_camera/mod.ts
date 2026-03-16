import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { t } from "../../lib/i18n/mod.ts";
import {
  compareAirQualitySummaries,
  CONFIG_KEYS,
  createSoracomClientFromEnv,
  filterAirQualityEntriesByTimeRange,
  getConfigValue,
  summarizeAirQualityEntries,
} from "../../lib/soracom/mod.ts";
import type { SoraCamImageExport } from "../../lib/soracom/mod.ts";
import {
  imsiSchema,
  soraCamDeviceIdSchema,
} from "../../lib/validation/schemas.ts";
import { formatVentilationEffectReviewMessage } from "../ventilation_effect_review/mod.ts";

const DEFAULT_CO2_THRESHOLD = 1000;
const DEFAULT_BEFORE_MINUTES = 60;
const DEFAULT_AFTER_MINUTES = 60;

/**
 * 換気確認とカメラ画像確認をまとめて行う関数定義
 */
export const VentilationCheckWithCameraFunctionDefinition = DefineFunction({
  callback_id: "ventilation_check_with_camera",
  title: "Ventilation Check With Camera",
  description:
    "Compare air quality before and after ventilation and attach a nearby SoraCam snapshot",
  source_file: "functions/ventilation_check_with_camera/mod.ts",
  input_parameters: {
    properties: {
      imsi: {
        type: Schema.types.string,
        description: "IMSI of the subscriber (15 digits)",
      },
      device_id: {
        type: Schema.types.string,
        description: "SoraCam device ID",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "Channel to post results",
      },
      reference_time: {
        type: Schema.types.string,
        description: "Reference time in ISO 8601 format",
      },
      before_minutes: {
        type: Schema.types.number,
        description: "Window length before the reference time in minutes",
      },
      after_minutes: {
        type: Schema.types.number,
        description: "Window length after the reference time in minutes",
      },
      co2_threshold: {
        type: Schema.types.number,
        description: "CO2 alert threshold in ppm",
      },
    },
    required: ["imsi", "device_id", "channel_id", "reference_time"],
  },
  output_parameters: {
    properties: {
      imsi: {
        type: Schema.types.string,
        description: "IMSI",
      },
      device_id: {
        type: Schema.types.string,
        description: "SoraCam device ID",
      },
      before_sample_count: {
        type: Schema.types.number,
        description: "Number of samples before the reference time",
      },
      after_sample_count: {
        type: Schema.types.number,
        description: "Number of samples after the reference time",
      },
      image_url: {
        type: Schema.types.string,
        description: "Snapshot URL if available",
      },
      message: {
        type: Schema.types.string,
        description: "Formatted result message",
      },
    },
    required: [
      "imsi",
      "device_id",
      "before_sample_count",
      "after_sample_count",
      "image_url",
      "message",
    ],
  },
});

/**
 * 換気確認結果にカメラ画像情報を付加したメッセージを生成します。
 *
 * @param reviewMessage - 換気効果レビュー本文
 * @param deviceId - SoraCam device ID
 * @param referenceTime - Snapshot reference time
 * @param exportResult - Image export result
 * @returns フォーマット済みメッセージ
 */
export function formatVentilationCheckWithCameraMessage(
  reviewMessage: string,
  deviceId: string,
  referenceTime: number,
  exportResult: SoraCamImageExport | null,
): string {
  const cameraHeader = t(
    "soracom.messages.ventilation_check_with_camera_header",
    {
      deviceId,
      referenceTime: new Date(referenceTime).toISOString(),
    },
  );

  if (exportResult === null) {
    return [
      reviewMessage,
      "",
      `*${cameraHeader}*`,
      t("soracom.messages.ventilation_check_with_camera_snapshot_unavailable"),
    ].join("\n");
  }

  if (exportResult.status === "completed" && exportResult.url) {
    return [
      reviewMessage,
      "",
      `*${cameraHeader}*`,
      t("soracom.messages.ventilation_check_with_camera_snapshot_url", {
        url: exportResult.url,
      }),
    ].join("\n");
  }

  return [
    reviewMessage,
    "",
    `*${cameraHeader}*`,
    t("soracom.messages.ventilation_check_with_camera_snapshot_processing", {
      exportId: exportResult.exportId,
    }),
  ].join("\n");
}

export default SlackFunction(
  VentilationCheckWithCameraFunctionDefinition,
  async ({ inputs, client }) => {
    try {
      const validImsi = imsiSchema.parse(inputs.imsi);
      const validDeviceId = soraCamDeviceIdSchema.parse(inputs.device_id);
      const referenceTime = Date.parse(inputs.reference_time);
      const beforeMinutes = inputs.before_minutes ?? DEFAULT_BEFORE_MINUTES;
      const afterMinutes = inputs.after_minutes ?? DEFAULT_AFTER_MINUTES;
      const co2Threshold = inputs.co2_threshold ?? DEFAULT_CO2_THRESHOLD;

      if (
        !Number.isFinite(referenceTime) ||
        !Number.isFinite(beforeMinutes) ||
        beforeMinutes <= 0 ||
        !Number.isFinite(afterMinutes) ||
        afterMinutes <= 0 ||
        !Number.isFinite(co2Threshold) ||
        co2Threshold <= 0
      ) {
        throw new Error(t("errors.invalid_input"));
      }

      console.log(
        t("soracom.logs.generating_ventilation_check_with_camera", {
          imsi: validImsi,
          deviceId: validDeviceId,
          referenceTime: new Date(referenceTime).toISOString(),
        }),
      );

      const channelId = await getConfigValue(
        client,
        CONFIG_KEYS.SORACAM_CHANNEL_ID,
        inputs.channel_id,
      );

      const soracomClient = createSoracomClientFromEnv();
      const beforeStartTime = referenceTime - beforeMinutes * 60 * 1000;
      const afterEndTime = referenceTime + afterMinutes * 60 * 1000;
      const result = await soracomClient.getHarvestData(
        validImsi,
        beforeStartTime,
        afterEndTime,
      );

      const beforeSummary = summarizeAirQualityEntries(
        filterAirQualityEntriesByTimeRange(
          result.entries,
          beforeStartTime,
          referenceTime,
        ),
        co2Threshold,
      );
      const afterSummary = summarizeAirQualityEntries(
        filterAirQualityEntriesByTimeRange(
          result.entries,
          referenceTime,
          afterEndTime,
        ),
        co2Threshold,
      );
      const comparison = compareAirQualitySummaries(
        beforeSummary,
        afterSummary,
      );
      const reviewMessage = formatVentilationEffectReviewMessage(
        validImsi,
        referenceTime,
        beforeSummary,
        afterSummary,
        comparison,
        beforeMinutes,
        afterMinutes,
      );

      let exportResult: SoraCamImageExport | null = await soracomClient
        .exportSoraCamImage(validDeviceId, referenceTime);

      if (exportResult.status === "processing") {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        exportResult = await soracomClient.getSoraCamImageExport(
          validDeviceId,
          exportResult.exportId,
        );
      }

      const message = formatVentilationCheckWithCameraMessage(
        reviewMessage,
        validDeviceId,
        referenceTime,
        exportResult,
      );

      await client.chat.postMessage({
        channel: channelId,
        text: message,
      });

      return {
        outputs: {
          imsi: validImsi,
          device_id: validDeviceId,
          before_sample_count: beforeSummary.sampleCount,
          after_sample_count: afterSummary.sampleCount,
          image_url: exportResult.url ?? "",
          message,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("ventilation_check_with_camera error:", errorMessage);
      return { error: errorMessage };
    }
  },
);
