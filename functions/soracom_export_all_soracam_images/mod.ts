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
  pickSoraCamSnapshotTime,
  type SoraCamDevice,
  type SoraCamImageExportReportResult,
  type SoracomClient,
  summarizeSoraCamImageExportResults,
} from "../../lib/soracom/mod.ts";

const MAX_PARALLEL_EXPORTS = 3;

/**
 * 全ソラカメ画像エクスポート結果
 */
export type SoraCamBatchImageExportResult = SoraCamImageExportReportResult;

/**
 * 全ソラカメ画像エクスポート関数定義
 */
export const SoracomExportAllSoraCamImagesFunctionDefinition = DefineFunction({
  callback_id: "soracom_export_all_soracam_images",
  title: "SoraCam全台画像エクスポート",
  description: "すべての SoraCam デバイスから画像を切り出して共有します",
  source_file: "functions/soracom_export_all_soracam_images/mod.ts",
  input_parameters: {
    properties: {
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "結果を投稿するチャンネル",
      },
    },
    required: ["channel_id"],
  },
  output_parameters: {
    properties: {
      device_count: {
        type: Schema.types.number,
        description: "対象デバイス数",
      },
      completed_count: {
        type: Schema.types.number,
        description: "完了したエクスポート数",
      },
      processing_count: {
        type: Schema.types.number,
        description: "処理中のエクスポート数",
      },
      failed_count: {
        type: Schema.types.number,
        description: "失敗したエクスポート数",
      },
      message: {
        type: Schema.types.string,
        description: "整形済みのエクスポート結果メッセージ",
      },
    },
    required: [
      "device_count",
      "completed_count",
      "processing_count",
      "failed_count",
      "message",
    ],
  },
});

function buildBatchExportResult(
  device: SoraCamDevice,
  exportId: string,
  imageUrl: string,
  snapshotTime: number,
  slackFileId: string,
): SoraCamBatchImageExportResult {
  return {
    deviceId: device.deviceId,
    deviceName: device.name,
    exportId,
    status: "uploaded",
    imageUrl,
    snapshotTime,
    slackFileId,
  };
}

function buildFailedBatchExportResult(
  device: SoraCamDevice,
  errorMessage: string,
): SoraCamBatchImageExportResult {
  return {
    deviceId: device.deviceId,
    deviceName: device.name,
    exportId: "",
    status: "failed",
    imageUrl: "",
    errorMessage,
  };
}

/**
 * エクスポート結果件数を状態ごとに集計します。
 *
 * @param results - 全デバイスのエクスポート結果
 * @returns 状態別の件数
 */
export function summarizeSoraCamBatchImageExportResults(
  results: SoraCamBatchImageExportResult[],
): {
  completed: number;
  processing: number;
  failed: number;
} {
  return summarizeSoraCamImageExportResults(results);
}

async function processSoraCamDevice(
  soracomClient: Pick<
    SoracomClient,
    | "listSoraCamRecordingsAndEvents"
    | "exportSoraCamImage"
    | "getSoraCamImageExport"
  >,
  client: SlackApiClient,
  channelId: string,
  device: SoraCamDevice,
): Promise<SoraCamBatchImageExportResult> {
  try {
    const snapshot = await captureSoraCamSnapshot(
      soracomClient,
      device.deviceId,
    );
    const slackFileId = await uploadSlackFileToChannel(
      client,
      channelId,
      snapshot.snapshotBytes,
      {
        filename: buildSoraCamSnapshotFileName(
          device.deviceId,
          snapshot.snapshotTime,
        ),
        title: buildSoraCamSnapshotTitle(
          device.name || device.deviceId,
          snapshot.snapshotTime,
        ),
        contentType: "image/jpeg",
      },
    );

    return buildBatchExportResult(
      device,
      snapshot.exportId,
      snapshot.imageUrl,
      snapshot.snapshotTime,
      slackFileId,
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `soracom_export_all_soracam_images process error (${device.deviceId}):`,
      errorMessage,
    );
    return buildFailedBatchExportResult(device, errorMessage);
  }
}

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<U>,
): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => runWorker(),
    ),
  );

  return results;
}

/**
 * 全ソラカメ画像エクスポート結果をフォーマットされたメッセージに変換します。
 *
 * @param results - 全デバイスのエクスポート結果
 * @returns フォーマットされたSlackメッセージ文字列
 */
export function formatSoraCamBatchImageExportMessage(
  results: SoraCamBatchImageExportResult[],
): string {
  return formatSoraCamImageExportReport(
    t("soracom.messages.soracam_all_image_exports_header", {
      count: results.length,
    }),
    results,
  );
}

export default SlackFunction(
  SoracomExportAllSoraCamImagesFunctionDefinition,
  async ({ inputs, client, env }) => {
    try {
      console.log(t("soracom.logs.exporting_all_soracam_images"));
      console.log(t("soracom.logs.fetching_soracam_recordings"));

      const soracomClient = createSoracomClientFromEnv(env);
      const devices = await soracomClient.listSoraCamDevices();
      const finalResults = await mapWithConcurrency(
        devices,
        MAX_PARALLEL_EXPORTS,
        (device) =>
          processSoraCamDevice(
            soracomClient,
            client as unknown as SlackApiClient,
            inputs.channel_id,
            device,
          ),
      );

      const counts = summarizeSoraCamBatchImageExportResults(finalResults);
      const message = formatSoraCamBatchImageExportMessage(finalResults);

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
          device_count: finalResults.length,
          completed_count: counts.completed,
          processing_count: counts.processing,
          failed_count: counts.failed,
          message,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("soracom_export_all_soracam_images error:", errorMessage);
      return { error: errorMessage };
    }
  },
);

export { pickSoraCamSnapshotTime };
