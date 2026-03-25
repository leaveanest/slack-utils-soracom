/**
 * Soracom APIクライアントモジュール
 *
 * Soracom REST APIとの通信を管理するクライアントとユーティリティを提供します。
 */

export {
  createSoracomClientFromEnv,
  normalizeAirStatsDataPoints,
  normalizeSoracomSim,
  SoracomClient,
} from "./client.ts";
export type { SoracomClientConfig } from "./client.ts";
export {
  bucketAirQualityEntries,
  compareAirQualitySummaries,
  DEFAULT_AIR_QUALITY_CRITERIA,
  extractAirQualitySample,
  filterAirQualityEntriesByTimeRange,
  findLargestCo2Spike,
  findPeakCo2Bucket,
  resolveAirQualityCriteria,
  summarizeAirQualityEntries,
} from "./air_quality.ts";
export type {
  AirQualityBucketSummary,
  AirQualityCriteria,
  AirQualityCriteriaInput,
  AirQualityMetricDelta,
  AirQualityMetricSummary,
  AirQualityRange,
  AirQualitySample,
  AirQualitySpike,
  AirQualitySummary,
  AirQualitySummaryDelta,
} from "./air_quality.ts";
export {
  bucketGpsMultiunitSamples,
  buildGpsMultiunitBucketRanges,
  buildGpsMultiunitGoogleMapsUrl,
  calculateGpsMultiunitDistanceMeters,
  extractGpsMultiunitSample,
  extractGpsMultiunitSamples,
  findLatestGpsMultiunitSample,
  hasGpsMultiunitLocation,
  isGpsMultiunitDeviceIssue,
  isGpsMultiunitWithinGeofence,
} from "./gps_multiunit.ts";
export type {
  GpsMultiunitBucketSummary,
  GpsMultiunitLocation,
  GpsMultiunitSample,
} from "./gps_multiunit.ts";
export {
  ALERT_CHANNEL_ID,
  getChannelId,
  REPORT_CHANNEL_ID,
  SORACAM_CHANNEL_ID,
} from "./config.ts";
export {
  buildAllSoraCamImageExportJobKey,
  deleteAllSoraCamImageExportJob,
  getAllSoraCamImageExportJob,
  upsertAllSoraCamImageExportJob,
} from "./all_soracam_image_export_jobs.ts";
export {
  buildAllSoraCamImageExportTaskKey,
  deleteAllSoraCamImageExportTasksByJob,
  getAllSoraCamImageExportTask,
  listAllSoraCamImageExportTasks,
  upsertAllSoraCamImageExportTask,
} from "./all_soracam_image_export_tasks.ts";
export {
  buildMotionCaptureJobKey,
  deleteMotionCaptureJob,
  getMotionCaptureJob,
  upsertMotionCaptureJob,
} from "./motion_capture_jobs.ts";
export {
  buildSoraCamSnapshotFileName,
  buildSoraCamSnapshotTitle,
  captureSoraCamSnapshot,
  downloadSoraCamSnapshot,
  pickSoraCamSnapshotTime,
  resolveSoraCamSnapshotTime,
  waitForSoraCamImageExport,
} from "./snapshot.ts";
export {
  formatSoraCamImageExportReport,
  summarizeSoraCamImageExportResults,
} from "./snapshot_report.ts";
export type {
  AirStatsDataPoint,
  AirStatsResult,
  HarvestDataEntry,
  HarvestDataResult,
  SoraCamDevice,
  SoraCamEvent,
  SoraCamImageExport,
  SoraCamRecording,
  SoraCamRecordingsAndEvents,
  SoracomAllSoraCamImageExportJob,
  SoracomAllSoraCamImageExportTask,
  SoracomApiError,
  SoracomAuthResponse,
  SoracomMotionCaptureJob,
  SoracomSim,
  SoracomSimListResult,
} from "./types.ts";
export type { SoraCamSnapshotCaptureResult } from "./snapshot.ts";
export type {
  SoraCamImageExportReportResult,
  SoraCamImageExportSummary,
} from "./snapshot_report.ts";

/**
 * バイト数を人間が読みやすい形式に変換します
 *
 * @param bytes - バイト数
 * @returns フォーマットされた文字列（例: "1.23 MB"）
 *
 * @example
 * ```typescript
 * formatBytes(1024) // => "1.00 KB"
 * formatBytes(1048576) // => "1.00 MB"
 * ```
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(2)} ${units[i]}`;
}
