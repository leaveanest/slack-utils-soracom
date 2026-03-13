/**
 * Soracom API 型定義
 *
 * Soracom REST APIのリクエスト/レスポンス型を定義します。
 */

/**
 * Soracom API認証レスポンス
 */
export interface SoracomAuthResponse {
  /** API キー */
  apiKey: string;
  /** 認証トークン */
  token: string;
  /** オペレーターID */
  operatorId: string;
}

/**
 * Soracom SIM情報
 */
export interface SoracomSim {
  /** SIM ID */
  simId: string;
  /** IMSI */
  imsi: string;
  /** MSISDN（電話番号） */
  msisdn: string;
  /** SIMの状態 */
  status: string;
  /** 速度クラス */
  speedClass: string;
  /** タグ */
  tags: Record<string, string>;
  /** IP アドレス */
  ipAddress: string;
  /** 作成日時（UNIXタイムスタンプ） */
  createdAt: number;
  /** 最終更新日時 */
  lastModifiedAt: number;
  /** グループID */
  groupId: string;
  /** オペレーターID */
  operatorId: string;
  /** サブスクリプション */
  subscription: string;
  /** モジュールタイプ */
  moduleType: string;
}

/**
 * SIM一覧レスポンス（ページネーション情報含む）
 */
export interface SoracomSimListResult {
  /** SIM一覧 */
  sims: SoracomSim[];
  /** 結果件数 */
  total: number;
}

/**
 * Air通信量統計データポイント
 */
export interface AirStatsDataPoint {
  /** 日時（UNIXタイムスタンプ） */
  date: number;
  /** アップロードバイト数 */
  uploadByteSizeTotal: number;
  /** ダウンロードバイト数 */
  downloadByteSizeTotal: number;
  /** アップロードパケット数 */
  uploadPacketSizeTotal: number;
  /** ダウンロードパケット数 */
  downloadPacketSizeTotal: number;
}

/**
 * Air通信量統計レスポンス
 */
export interface AirStatsResult {
  /** IMSI */
  imsi: string;
  /** 統計データポイント */
  dataPoints: AirStatsDataPoint[];
  /** 集計期間（"day" | "month"） */
  period: string;
}

/**
 * Harvest Dataエントリ
 */
export interface HarvestDataEntry {
  /** データ受信日時（UNIXタイムスタンプミリ秒） */
  time: number;
  /** データ内容（JSON） */
  content: Record<string, unknown>;
  /** コンテントタイプ */
  contentType: string;
}

/**
 * Harvest Dataクエリ結果
 */
export interface HarvestDataResult {
  /** IMSI */
  imsi: string;
  /** データエントリ一覧 */
  entries: HarvestDataEntry[];
}

/**
 * ソラカメデバイス情報
 */
export interface SoraCamDevice {
  /** デバイスID */
  deviceId: string;
  /** デバイス名 */
  name: string;
  /** デバイスの状態（"online" | "offline"） */
  status: string;
  /** ファームウェアバージョン */
  firmwareVersion: string;
  /** 最終オンライン日時（UNIXタイムスタンプミリ秒） */
  lastConnectedTime: number;
}

/**
 * ソラカメイベント情報
 */
export interface SoraCamEvent {
  /** デバイスID */
  deviceId: string;
  /** イベント種別（"motion" | "sound" | "person" 等） */
  eventType: string;
  /** イベント発生日時（UNIXタイムスタンプミリ秒） */
  eventTime: number;
  /** イベントの詳細情報 */
  eventInfo: Record<string, unknown>;
}

/**
 * ソラカメ画像エクスポートリクエスト
 */
export interface SoraCamImageExportRequest {
  /** エクスポート対象の日時（UNIXタイムスタンプミリ秒） */
  time: number;
}

/**
 * ソラカメ画像エクスポート結果
 */
export interface SoraCamImageExport {
  /** エクスポートID */
  exportId: string;
  /** デバイスID */
  deviceId: string;
  /** エクスポートの状態（"completed" | "processing" | "failed"） */
  status: string;
  /** エクスポートされた画像のURL */
  url: string;
  /** リクエスト日時 */
  requestedTime: number;
  /** 完了日時 */
  completedTime: number;
}

/**
 * Soracom APIエラーレスポンス
 */
export interface SoracomApiError {
  /** エラーコード */
  code: string;
  /** エラーメッセージ */
  message: string;
}
