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
  /** 次ページ取得用キー */
  nextKey?: string;
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
  content: unknown;
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
 * SoraCam 動体検知画像アップロードジョブ
 */
export interface SoracomMotionCaptureJob {
  /** ジョブ識別子（channel_id:device_id） */
  jobKey: string;
  /** 投稿先チャンネル */
  channelId: string;
  /** 対象デバイス */
  deviceId: string;
  /** 親メッセージの thread_ts */
  threadTs: string;
  /** 固定ウィンドウ開始時刻 */
  windowStartMs: number;
  /** 固定ウィンドウ終了時刻 */
  windowEndMs: number;
  /** 降順のイベント時刻一覧 */
  eventTimes: number[];
  /** 次に処理する index */
  nextIndex: number;
  /** イベント総件数 */
  totalEventCount: number;
  /** アップロード済み件数 */
  uploadedCount: number;
  /** 失敗件数 */
  failedCount: number;
  /** 初期化 claim ID */
  claimId?: string;
  /** 次回自動継続実行用 trigger ID */
  continuationTriggerId?: string;
  /** 状態 */
  status: "starting" | "pending" | "completed";
  /** 作成日時 */
  createdAt: string;
  /** 更新日時 */
  updatedAt: string;
}

/**
 * SoraCam 全台画像エクスポートジョブ
 */
export interface SoracomAllSoraCamImageExportJob {
  /** ジョブ識別子（channel_id） */
  jobKey: string;
  /** 投稿先チャンネル */
  channelId: string;
  /** 進捗メッセージの ts */
  messageTs: string;
  /** デバイス総数 */
  totalDeviceCount: number;
  /** 初期化 claim ID */
  claimId?: string;
  /** 状態 */
  status: "starting" | "pending" | "completed";
  /** 作成日時 */
  createdAt: string;
  /** 更新日時 */
  updatedAt: string;
}

/**
 * SoraCam 全台画像エクスポートの各デバイス処理状態
 */
export interface SoracomAllSoraCamImageExportTask {
  /** タスク識別子 */
  taskKey: string;
  /** 親ジョブ識別子 */
  jobKey: string;
  /** 投稿先チャンネル */
  channelId: string;
  /** デバイス ID */
  deviceId: string;
  /** デバイス表示名 */
  deviceName: string;
  /** 表示順 */
  sortIndex: number;
  /** claim ID */
  claimId?: string;
  /** エクスポート ID */
  exportId: string;
  /** 状態 */
  status: "queued" | "processing" | "uploaded" | "failed";
  /** エクスポート済み画像 URL */
  imageUrl: string;
  /** スナップショット取得時刻 */
  snapshotTime?: number;
  /** Slack ファイル ID */
  slackFileId?: string;
  /** 失敗詳細 */
  errorMessage?: string;
  /** 作成日時 */
  createdAt: string;
  /** 更新日時 */
  updatedAt: string;
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
 * ソラカメ録画区間
 */
export interface SoraCamRecording {
  /** 録画開始日時（UNIXタイムスタンプミリ秒） */
  startTime: number;
  /** 録画終了日時（UNIXタイムスタンプミリ秒） */
  endTime?: number;
}

/**
 * ソラカメ録画区間とイベントの取得結果
 */
export interface SoraCamRecordingsAndEvents {
  /** 録画区間一覧 */
  records: SoraCamRecording[];
  /** イベント一覧 */
  events: Array<{
    /** イベント種別 */
    type: string;
    /** 開始日時（UNIXタイムスタンプミリ秒） */
    startTime: number;
    /** 終了日時（UNIXタイムスタンプミリ秒） */
    endTime?: number;
  }>;
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
