import { t } from "../i18n/mod.ts";
import type { SoracomClient } from "./client.ts";
import { runWithImmediateRetry } from "./immediate_retry.ts";
import type { SoraCamImageExport, SoraCamRecording } from "./types.ts";

const RECORDING_LOOKBACK_MS = 6 * 60 * 60 * 1000;
const RECORDING_OFFSET_MS = 10 * 1000;
const EXPORT_POLL_INTERVAL_MS = 2 * 1000;
const EXPORT_TIMEOUT_MS = 60 * 1000;

class RetryableSoraCamSnapshotDownloadError extends Error {
  response: Response;

  constructor(response: Response) {
    super(`Retryable SoraCam snapshot download response: ${response.status}`);
    this.response = response;
  }
}

type SoraCamSnapshotClient = Pick<
  SoracomClient,
  | "listSoraCamRecordingsAndEvents"
  | "exportSoraCamImage"
  | "getSoraCamImageExport"
>;

/**
 * ソラカメのスナップショット取得結果です。
 */
export interface SoraCamSnapshotCaptureResult {
  /** デバイス ID */
  deviceId: string;
  /** エクスポート ID */
  exportId: string;
  /** エクスポート済み画像 URL */
  imageUrl: string;
  /** スナップショット取得時刻 */
  snapshotTime: number;
  /** ダウンロード済み JPEG */
  snapshotBytes: Uint8Array;
}

/**
 * 録画区間一覧から安全なスナップショット取得時刻を選択します。
 *
 * @param recordings - 録画区間一覧
 * @param offsetMs - 終了時刻から引くオフセット
 * @returns スナップショット取得時刻
 * @throws {Error} 録画区間がない場合
 */
export function pickSoraCamSnapshotTime(
  recordings: SoraCamRecording[],
  offsetMs = RECORDING_OFFSET_MS,
  now = Date.now(),
): number {
  if (recordings.length === 0) {
    throw new Error(t("errors.data_not_found"));
  }

  const targetRecording = recordings.reduce((latest, current) => {
    const latestAvailableTime = latest.endTime ?? now;
    const currentAvailableTime = current.endTime ?? now;

    return currentAvailableTime > latestAvailableTime ? current : latest;
  });

  const startTime = targetRecording.startTime;
  const latestAvailableTime = targetRecording.endTime ?? now;
  return Math.max(
    startTime,
    latestAvailableTime - offsetMs,
  );
}

/**
 * 直近の録画区間からスナップショット取得対象時刻を解決します。
 *
 * @param soracomClient - SORACOM クライアント
 * @param deviceId - 対象デバイス ID
 * @param now - 基準時刻
 * @returns スナップショット取得時刻
 */
export async function resolveSoraCamSnapshotTime(
  soracomClient: Pick<SoraCamSnapshotClient, "listSoraCamRecordingsAndEvents">,
  deviceId: string,
  now = Date.now(),
): Promise<number> {
  const recordingsAndEvents = await soracomClient
    .listSoraCamRecordingsAndEvents(
      deviceId,
      now - RECORDING_LOOKBACK_MS,
      now,
      "desc",
    );

  if (recordingsAndEvents.records.length === 0) {
    throw new Error(
      t("soracom.errors.soracam_no_recent_recordings", {
        deviceId,
      }),
    );
  }

  return pickSoraCamSnapshotTime(recordingsAndEvents.records);
}

function assertSoraCamImageExportSucceeded(
  deviceId: string,
  exportResult: SoraCamImageExport,
): void {
  if (
    exportResult.status === "failed" ||
    exportResult.status === "limitExceeded" ||
    exportResult.status === "expired"
  ) {
    throw new Error(
      t("soracom.errors.soracam_image_export_failed", {
        deviceId,
        status: exportResult.status,
      }),
    );
  }
}

/**
 * 画像スナップショットが完了するまで待機します。
 *
 * @param soracomClient - SORACOM クライアント
 * @param deviceId - 対象デバイス ID
 * @param exportId - エクスポート ID
 * @returns 完了済みエクスポート情報
 */
export async function waitForSoraCamImageExport(
  soracomClient: Pick<SoraCamSnapshotClient, "getSoraCamImageExport">,
  deviceId: string,
  exportId: string,
): Promise<SoraCamImageExport> {
  const deadline = Date.now() + EXPORT_TIMEOUT_MS;
  let lastStatus = "initializing";

  while (Date.now() < deadline) {
    const exportResult = await soracomClient.getSoraCamImageExport(
      deviceId,
      exportId,
    );
    lastStatus = exportResult.status;
    assertSoraCamImageExportSucceeded(deviceId, exportResult);

    if (exportResult.status === "completed" && exportResult.url) {
      return exportResult;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, EXPORT_POLL_INTERVAL_MS)
    );
  }

  throw new Error(
    t("soracom.errors.soracam_image_export_timeout", {
      deviceId,
      exportId,
      status: lastStatus,
    }),
  );
}

/**
 * エクスポート済みスナップショットをダウンロードします。
 *
 * @param deviceId - 対象デバイス ID
 * @param imageUrl - presigned URL
 * @returns JPEG バイト列
 */
export async function downloadSoraCamSnapshot(
  deviceId: string,
  imageUrl: string,
): Promise<Uint8Array> {
  try {
    return await runWithImmediateRetry(
      async () => {
        const response = await fetch(imageUrl);

        if (!response.ok && response.status >= 500) {
          throw new RetryableSoraCamSnapshotDownloadError(response);
        }

        if (!response.ok) {
          throw new Error(
            t("soracom.errors.soracam_snapshot_download_failed", {
              deviceId,
              status: response.status,
            }),
          );
        }

        return new Uint8Array(await response.arrayBuffer());
      },
      (error) =>
        error instanceof RetryableSoraCamSnapshotDownloadError ||
        error instanceof TypeError,
    );
  } catch (error) {
    if (error instanceof RetryableSoraCamSnapshotDownloadError) {
      throw new Error(
        t("soracom.errors.soracam_snapshot_download_failed", {
          deviceId,
          status: error.response.status,
        }),
      );
    }

    throw error;
  }
}

function sanitizeFileNameSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_");
}

/**
 * スナップショットの保存用ファイル名を生成します。
 *
 * @param deviceId - 対象デバイス ID
 * @param snapshotTime - スナップショット取得時刻
 * @returns ファイル名
 */
export function buildSoraCamSnapshotFileName(
  deviceId: string,
  snapshotTime: number,
): string {
  return `soracam_${sanitizeFileNameSegment(deviceId)}_${snapshotTime}.jpg`;
}

/**
 * Slack 上の表示タイトルを生成します。
 *
 * @param deviceLabel - デバイス表示名
 * @param snapshotTime - スナップショット取得時刻
 * @returns タイトル文字列
 */
export function buildSoraCamSnapshotTitle(
  deviceLabel: string,
  snapshotTime: number,
): string {
  return `${deviceLabel} ${new Date(snapshotTime).toISOString()}`;
}

/**
 * 直近録画からスナップショットを切り出し、すぐにダウンロードします。
 *
 * @param soracomClient - SORACOM クライアント
 * @param deviceId - 対象デバイス ID
 * @param now - 基準時刻
 * @returns ダウンロード済みスナップショット情報
 */
export async function captureSoraCamSnapshot(
  soracomClient: SoraCamSnapshotClient,
  deviceId: string,
  now = Date.now(),
): Promise<SoraCamSnapshotCaptureResult> {
  const snapshotTime = await resolveSoraCamSnapshotTime(
    soracomClient,
    deviceId,
    now,
  );
  const requestedExport = await soracomClient.exportSoraCamImage(
    deviceId,
    snapshotTime,
  );
  assertSoraCamImageExportSucceeded(deviceId, requestedExport);

  const completedExport =
    requestedExport.status === "completed" && requestedExport.url
      ? requestedExport
      : await waitForSoraCamImageExport(
        soracomClient,
        deviceId,
        requestedExport.exportId,
      );

  const snapshotBytes = await downloadSoraCamSnapshot(
    deviceId,
    completedExport.url,
  );

  return {
    deviceId,
    exportId: completedExport.exportId,
    imageUrl: completedExport.url,
    snapshotTime,
    snapshotBytes,
  };
}
