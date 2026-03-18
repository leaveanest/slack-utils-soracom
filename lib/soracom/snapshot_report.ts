import { formatLocalizedDateTime, t } from "../i18n/mod.ts";

/**
 * ソラカメ画像エクスポートの表示用結果です。
 */
export interface SoraCamImageExportReportResult {
  /** デバイス ID */
  deviceId: string;
  /** デバイス名 */
  deviceName: string;
  /** エクスポート ID */
  exportId: string;
  /** 表示用の状態 */
  status: string;
  /** 画像 URL */
  imageUrl: string;
  /** スナップショット取得時刻 */
  snapshotTime?: number;
  /** Slack ファイル ID */
  slackFileId?: string;
  /** 失敗詳細 */
  errorMessage?: string;
}

/**
 * 状態別の集計結果です。
 */
export interface SoraCamImageExportSummary {
  completed: number;
  processing: number;
  failed: number;
}

function formatDeviceHeading(
  deviceName: string,
  deviceId: string,
): string {
  return deviceName && deviceName !== deviceId
    ? `*${deviceName}*`
    : `*${deviceId}*`;
}

function formatSummary(summary: SoraCamImageExportSummary): string {
  const segments = [
    t("soracom.messages.soracam_image_export_summary_succeeded", {
      count: summary.completed,
    }),
  ];

  if (summary.processing > 0) {
    segments.push(
      t("soracom.messages.soracam_image_export_summary_processing", {
        count: summary.processing,
      }),
    );
  }

  segments.push(
    t("soracom.messages.soracam_image_export_summary_failed", {
      count: summary.failed,
    }),
  );

  return segments.join(" / ");
}

function formatDeviceReport(
  result: SoraCamImageExportReportResult,
): string {
  const lines = [formatDeviceHeading(result.deviceName, result.deviceId)];

  if (result.deviceName && result.deviceName !== result.deviceId) {
    lines.push(
      t("soracom.messages.soracam_image_export_device_id", {
        deviceId: result.deviceId,
      }),
    );
  }

  if (result.snapshotTime !== undefined) {
    lines.push(
      t("soracom.messages.soracam_image_export_snapshot_time", {
        time: formatLocalizedDateTime(result.snapshotTime),
      }),
    );
  }

  if (result.status === "uploaded") {
    lines.push(t("soracom.messages.soracam_image_export_result_uploaded"));
    return lines.join("\n");
  }

  if (result.status === "processing") {
    lines.push(
      t("soracom.messages.soracam_image_export_result_processing", {
        exportId: result.exportId || "-",
      }),
    );
    return lines.join("\n");
  }

  if (result.status === "completed") {
    lines.push(t("soracom.messages.soracam_image_export_result_completed"));
    if (result.imageUrl) {
      lines.push(
        t("soracom.messages.soracam_image_export_url", {
          url: result.imageUrl,
        }),
      );
    }
    return lines.join("\n");
  }

  lines.push(t("soracom.messages.soracam_image_export_result_failed"));
  if (result.errorMessage) {
    lines.push(
      t("soracom.messages.soracam_image_export_result_detail", {
        message: result.errorMessage,
      }),
    );
  }

  return lines.join("\n");
}

/**
 * 画像エクスポート結果件数を状態ごとに集計します。
 *
 * @param results - 表示用の結果一覧
 * @returns 状態別件数
 */
export function summarizeSoraCamImageExportResults(
  results: SoraCamImageExportReportResult[],
): SoraCamImageExportSummary {
  return results.reduce(
    (counts, result) => {
      if (result.status === "completed" || result.status === "uploaded") {
        counts.completed += 1;
      } else if (result.status === "processing") {
        counts.processing += 1;
      } else {
        counts.failed += 1;
      }

      return counts;
    },
    {
      completed: 0,
      processing: 0,
      failed: 0,
    },
  );
}

/**
 * 画像エクスポート結果を Slack 投稿向けのレポートに整形します。
 *
 * @param header - レポート見出し
 * @param results - 表示用の結果一覧
 * @returns 整形済みメッセージ
 */
export function formatSoraCamImageExportReport(
  header: string,
  results: SoraCamImageExportReportResult[],
): string {
  if (results.length === 0) {
    return t("soracom.messages.soracam_no_devices");
  }

  const summary = summarizeSoraCamImageExportResults(results);
  const deviceReports = results.map(formatDeviceReport);

  return `*${header}*\n${formatSummary(summary)}\n\n${
    deviceReports.join("\n\n")
  }`;
}
