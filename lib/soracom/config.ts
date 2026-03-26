/**
 * Soracom Slack連携の共通設定
 *
 * 環境変数から通知先チャンネルやスケジュール設定を読み込みます。
 * `.env`ファイルまたはSlack CLIの環境変数設定で値を指定してください。
 *
 * @example
 * ```
 * # .env
 * SORACOM_ALERT_CHANNEL_ID=C1234567890
 * SORACOM_REPORT_CHANNEL_ID=C0987654321
 * SORACOM_SORACAM_CHANNEL_ID=C1111111111
 * ```
 */

import { getOptionalEnv } from "../env.ts";

/**
 * 環境変数から通知先チャンネルIDを取得します
 *
 * 優先順位:
 * 1. 機能別の環境変数（SORACOM_ALERT_CHANNEL_ID等）
 * 2. 共通の環境変数（SORACOM_DEFAULT_CHANNEL_ID）
 * 3. フォールバック値
 *
 * @param envKey - 機能別の環境変数名
 * @param fallback - フォールバック値（デフォルト: "C0000000000"）
 * @returns チャンネルID
 */
export function getChannelId(
  envKey: string,
  fallback = "C0000000000",
): string {
  return getOptionalEnv(envKey) ||
    getOptionalEnv("SORACOM_DEFAULT_CHANNEL_ID") ||
    fallback;
}

/**
 * SIM異常検知アラートの通知先チャンネルID
 *
 * 環境変数: SORACOM_ALERT_CHANNEL_ID または SORACOM_DEFAULT_CHANNEL_ID
 */
export const ALERT_CHANNEL_ID = getChannelId("SORACOM_ALERT_CHANNEL_ID");

/**
 * SIM通信量レポートの投稿先チャンネルID
 *
 * 環境変数: SORACOM_REPORT_CHANNEL_ID または SORACOM_DEFAULT_CHANNEL_ID
 */
export const REPORT_CHANNEL_ID = getChannelId("SORACOM_REPORT_CHANNEL_ID");

/**
 * ソラカメ通知の投稿先チャンネルID
 *
 * 環境変数: SORACOM_SORACAM_CHANNEL_ID または SORACOM_DEFAULT_CHANNEL_ID
 */
export const SORACAM_CHANNEL_ID = getChannelId("SORACOM_SORACAM_CHANNEL_ID");
