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
  ALERT_CHANNEL_ID,
  getChannelId,
  REPORT_CHANNEL_ID,
  SORACAM_CHANNEL_ID,
} from "./config.ts";
export {
  CONFIG_KEYS,
  getAllConfigValues,
  getConfigValue,
  setConfigValue,
} from "./datastore.ts";
export { listSensorProfiles, upsertSensorProfile } from "./sensor_profiles.ts";
export type { SoracomSensorProfileInput } from "./sensor_profiles.ts";
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
  SoracomApiError,
  SoracomAuthResponse,
  SoracomSensorProfile,
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
