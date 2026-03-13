/**
 * Soracom APIクライアントモジュール
 *
 * Soracom REST APIとの通信を管理するクライアントとユーティリティを提供します。
 */

export { createSoracomClientFromEnv, SoracomClient } from "./client.ts";
export type { SoracomClientConfig } from "./client.ts";
export type {
  AirStatsDataPoint,
  AirStatsResult,
  HarvestDataEntry,
  HarvestDataResult,
  SoracomApiError,
  SoracomAuthResponse,
  SoraCamDevice,
  SoraCamEvent,
  SoraCamImageExport,
  SoracomSim,
  SoracomSimListResult,
} from "./types.ts";

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
