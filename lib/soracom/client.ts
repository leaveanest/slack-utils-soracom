/**
 * Soracom APIクライアント
 *
 * Soracom REST APIとの通信を管理するクライアントモジュールです。
 * 認証、SIM管理、通信量統計の取得をサポートします。
 *
 * @example
 * ```typescript
 * const client = new SoracomClient({
 *   authKeyId: "keyId-xxx",
 *   authKey: "secret-xxx",
 *   coverageType: "jp",
 * });
 * const sims = await client.listSims();
 * ```
 */

import { type EnvVars, getRuntimeEnv } from "../env.ts";
import { t } from "../i18n/mod.ts";
import type {
  AirStatsDataPoint,
  AirStatsResult,
  HarvestDataEntry,
  HarvestDataResult,
  SoraCamDevice,
  SoraCamEvent,
  SoraCamImageExport,
  SoraCamRecordingsAndEvents,
  SoracomApiError,
  SoracomAuthResponse,
  SoracomSim,
  SoracomSimListResult,
} from "./types.ts";

interface RawSoracomSubscriber {
  status?: string;
  subscription?: string;
  imsi?: string;
  msisdn?: string;
}

interface RawSoracomProfile {
  primaryImsi?: string;
  subscribers?: Record<string, RawSoracomSubscriber>;
}

interface RawSoracomSessionStatus {
  imsi?: string;
  ueIpAddress?: string | null;
  subscription?: string;
}

interface RawSoracomSim {
  simId?: string;
  imsi?: string;
  msisdn?: string;
  status?: string;
  speedClass?: string;
  tags?: Record<string, string>;
  ipAddress?: string;
  createdAt?: number;
  createdTime?: number;
  lastModifiedAt?: number;
  lastModifiedTime?: number;
  groupId?: string;
  operatorId?: string;
  subscription?: string;
  moduleType?: string;
  profiles?: Record<string, RawSoracomProfile>;
  activeProfileId?: string;
  sessionStatus?: RawSoracomSessionStatus;
  previousSession?: RawSoracomSessionStatus;
}

interface RawAirTrafficStats {
  uploadByteSizeTotal?: number;
  downloadByteSizeTotal?: number;
  uploadPacketSizeTotal?: number;
  downloadPacketSizeTotal?: number;
}

interface RawAirStatsDataPoint {
  date?: string | number;
  unixtime?: number;
  uploadByteSizeTotal?: number;
  downloadByteSizeTotal?: number;
  uploadPacketSizeTotal?: number;
  downloadPacketSizeTotal?: number;
  dataTrafficStatsMap?: Record<string, RawAirTrafficStats>;
}

interface AirTrafficStatsTotals {
  uploadByteSizeTotal: number;
  downloadByteSizeTotal: number;
  uploadPacketSizeTotal: number;
  downloadPacketSizeTotal: number;
}

/** APIベースURL */
const BASE_URLS: Record<string, string> = {
  jp: "https://api.soracom.io/v1",
  g: "https://g.api.soracom.io/v1",
};

function getPrimaryProfile(
  rawSim: RawSoracomSim,
): RawSoracomProfile | undefined {
  if (!rawSim.profiles) {
    return undefined;
  }

  if (rawSim.activeProfileId && rawSim.profiles[rawSim.activeProfileId]) {
    return rawSim.profiles[rawSim.activeProfileId];
  }

  return Object.values(rawSim.profiles)[0];
}

function getPrimarySubscriber(
  rawSim: RawSoracomSim,
): RawSoracomSubscriber | undefined {
  const profile = getPrimaryProfile(rawSim);
  if (!profile?.subscribers) {
    return undefined;
  }

  return Object.values(profile.subscribers)[0];
}

/**
 * SORACOM SIMレスポンスをアプリ内の共通形式に変換します。
 *
 * `listSims()` / `getSim()` のレスポンスでは、IMSI や subscription などが
 * `profiles` や `sessionStatus` の下にネストされる場合があるため、
 * 呼び出し側ではトップレベルの `SoracomSim` だけを見ればよい形に揃えます。
 *
 * @param rawSim - APIレスポンスのSIMデータ
 * @returns 正規化済みのSIMデータ
 */
export function normalizeSoracomSim(rawSim: RawSoracomSim): SoracomSim {
  const profile = getPrimaryProfile(rawSim);
  const subscriber = getPrimarySubscriber(rawSim);

  return {
    simId: rawSim.simId || "",
    imsi: rawSim.imsi ||
      rawSim.sessionStatus?.imsi ||
      subscriber?.imsi ||
      profile?.primaryImsi ||
      rawSim.previousSession?.imsi ||
      "",
    msisdn: rawSim.msisdn || subscriber?.msisdn || "",
    status: rawSim.status || subscriber?.status || "",
    speedClass: rawSim.speedClass || "",
    tags: rawSim.tags || {},
    ipAddress: rawSim.ipAddress || rawSim.sessionStatus?.ueIpAddress || "",
    createdAt: rawSim.createdAt ?? rawSim.createdTime ?? 0,
    lastModifiedAt: rawSim.lastModifiedAt ?? rawSim.lastModifiedTime ?? 0,
    groupId: rawSim.groupId || "",
    operatorId: rawSim.operatorId || "",
    subscription: rawSim.subscription ||
      rawSim.sessionStatus?.subscription ||
      subscriber?.subscription ||
      rawSim.previousSession?.subscription ||
      "",
    moduleType: rawSim.moduleType || "",
  };
}

/**
 * SORACOM Air通信量統計レスポンスを共通形式に変換します。
 *
 * IMSI指定APIはトップレベルに集計値を返し、SIM ID指定APIは
 * `dataTrafficStatsMap` 配下に速度クラスごとの集計値を返すため、
 * 呼び出し元で同じ形式を扱えるように正規化します。
 *
 * @param rawDataPoints - APIレスポンスのデータポイント配列
 * @returns 正規化済みのデータポイント配列
 * @throws {Error} レスポンス形式が不正な場合
 */
export function normalizeAirStatsDataPoints(
  rawDataPoints: unknown,
): AirStatsDataPoint[] {
  if (!Array.isArray(rawDataPoints)) {
    throw new Error("Unexpected air stats response format");
  }

  return rawDataPoints.map((point) => {
    const rawPoint = point as RawAirStatsDataPoint;

    if (rawPoint.dataTrafficStatsMap) {
      const totals = Object.values(rawPoint.dataTrafficStatsMap).reduce(
        (acc: AirTrafficStatsTotals, stats): AirTrafficStatsTotals => ({
          uploadByteSizeTotal: acc.uploadByteSizeTotal +
            (stats.uploadByteSizeTotal ?? 0),
          downloadByteSizeTotal: acc.downloadByteSizeTotal +
            (stats.downloadByteSizeTotal ?? 0),
          uploadPacketSizeTotal: acc.uploadPacketSizeTotal +
            (stats.uploadPacketSizeTotal ?? 0),
          downloadPacketSizeTotal: acc.downloadPacketSizeTotal +
            (stats.downloadPacketSizeTotal ?? 0),
        }),
        {
          uploadByteSizeTotal: 0,
          downloadByteSizeTotal: 0,
          uploadPacketSizeTotal: 0,
          downloadPacketSizeTotal: 0,
        } satisfies AirTrafficStatsTotals,
      );

      return {
        date: rawPoint.unixtime ?? 0,
        ...totals,
      };
    }

    return {
      date: typeof rawPoint.date === "number" ? rawPoint.date : 0,
      uploadByteSizeTotal: rawPoint.uploadByteSizeTotal ?? 0,
      downloadByteSizeTotal: rawPoint.downloadByteSizeTotal ?? 0,
      uploadPacketSizeTotal: rawPoint.uploadPacketSizeTotal ?? 0,
      downloadPacketSizeTotal: rawPoint.downloadPacketSizeTotal ?? 0,
    };
  });
}

/**
 * Soracomクライアント設定
 */
export interface SoracomClientConfig {
  /** 認証キーID */
  authKeyId: string;
  /** 認証キーシークレット */
  authKey: string;
  /** カバレッジタイプ（"jp" または "g"） */
  coverageType: "jp" | "g";
}

/**
 * Soracom REST APIクライアント
 *
 * 認証トークンの取得と管理、各種APIエンドポイントへのアクセスを提供します。
 *
 * @example
 * ```typescript
 * const client = new SoracomClient({
 *   authKeyId: "keyId-xxx",
 *   authKey: "secret-xxx",
 *   coverageType: "jp",
 * });
 *
 * // SIM一覧を取得
 * const result = await client.listSims();
 * console.log(result.sims);
 *
 * // 特定SIMの詳細を取得
 * const sim = await client.getSim("8942...");
 *
 * // 通信量統計を取得
 * const stats = await client.getAirUsage("44010...", "day", from, to);
 * ```
 */
export class SoracomClient {
  private config: SoracomClientConfig;
  private baseUrl: string;
  private apiKey: string | null = null;
  private token: string | null = null;

  constructor(config: SoracomClientConfig) {
    this.config = config;
    this.baseUrl = BASE_URLS[config.coverageType];
  }

  /**
   * Soracom APIに認証してトークンを取得します
   *
   * @throws {Error} 認証に失敗した場合
   */
  async authenticate(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        authKeyId: this.config.authKeyId,
        authKey: this.config.authKey,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        t("soracom.errors.auth_failed", { error: errorBody }),
      );
    }

    const data: SoracomAuthResponse = await response.json();
    this.apiKey = data.apiKey;
    this.token = data.token;
  }

  /**
   * 認証済みHTTPリクエストを送信します
   *
   * @param path - APIパス（例: "/sims"）
   * @param options - fetchオプション
   * @returns レスポンス
   * @throws {Error} 認証されていない場合、またはAPIエラーの場合
   */
  private async request(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    if (!this.apiKey || !this.token) {
      await this.authenticate();
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "X-Soracom-API-Key": this.apiKey!,
        "X-Soracom-Token": this.token!,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorBody: SoracomApiError = await response.json().catch(() => ({
        code: "unknown",
        message: response.statusText,
      }));
      throw new Error(
        t("soracom.errors.api_request_failed", {
          status: response.status,
          message: errorBody.message,
        }),
      );
    }

    return response;
  }

  /**
   * SIM一覧を取得します
   *
   * @param limit - 取得件数（デフォルト: 10、最大: 100）
   * @param lastEvaluatedKey - ページネーション用の前ページ最終キー
   * @returns SIM一覧とページネーション情報
   * @throws {Error} API呼び出しに失敗した場合
   *
   * @example
   * ```typescript
   * const result = await client.listSims(10);
   * console.log(`取得件数: ${result.sims.length}`);
   * ```
   */
  async listSims(
    limit = 10,
    lastEvaluatedKey?: string,
  ): Promise<SoracomSimListResult> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (lastEvaluatedKey) {
      params.set("last_evaluated_key", lastEvaluatedKey);
    }

    const response = await this.request(`/sims?${params.toString()}`);
    const sims = (await response.json() as RawSoracomSim[]).map(
      normalizeSoracomSim,
    );

    return {
      sims,
      total: sims.length,
    };
  }

  /**
   * 指定したSIMの詳細情報を取得します
   *
   * @param simId - SIM ID
   * @returns SIM詳細情報
   * @throws {Error} SIMが見つからない場合、またはAPI呼び出しに失敗した場合
   *
   * @example
   * ```typescript
   * const sim = await client.getSim("8942...");
   * console.log(`SIM状態: ${sim.status}`);
   * ```
   */
  async getSim(simId: string): Promise<SoracomSim> {
    const response = await this.request(`/sims/${simId}`);
    const sim = await response.json() as RawSoracomSim;
    return normalizeSoracomSim(sim);
  }

  /**
   * 指定したサブスクライバーの通信量統計を取得します
   *
   * @param imsi - IMSI
   * @param period - 集計期間（"day" または "month"）
   * @param from - 開始日時（UNIXタイムスタンプ秒）
   * @param to - 終了日時（UNIXタイムスタンプ秒）
   * @returns 通信量統計データ
   * @throws {Error} API呼び出しに失敗した場合
   *
   * @example
   * ```typescript
   * const now = Math.floor(Date.now() / 1000);
   * const oneMonthAgo = now - 30 * 24 * 60 * 60;
   * const stats = await client.getAirUsage("44010...", "day", oneMonthAgo, now);
   * ```
   */
  async getAirUsage(
    imsi: string,
    period: "day" | "month",
    from: number,
    to: number,
  ): Promise<AirStatsResult> {
    const params = new URLSearchParams({
      period,
      from: String(from),
      to: String(to),
    });

    const response = await this.request(
      `/stats/air/subscribers/${imsi}?${params.toString()}`,
    );
    const dataPoints = normalizeAirStatsDataPoints(await response.json());

    return {
      imsi,
      dataPoints,
      period,
    };
  }

  /**
   * 指定したSIM IDの通信量統計を取得します。
   *
   * @param simId - SIM ID
   * @param period - 集計期間（"day" または "month"）
   * @param from - 開始日時（UNIXタイムスタンプ秒）
   * @param to - 終了日時（UNIXタイムスタンプ秒）
   * @returns 通信量統計データ
   * @throws {Error} API呼び出しに失敗した場合
   */
  async getAirUsageOfSim(
    simId: string,
    period: "day" | "month",
    from: number,
    to: number,
  ): Promise<AirStatsResult> {
    const params = new URLSearchParams({
      period,
      from: String(from),
      to: String(to),
    });

    const response = await this.request(
      `/stats/air/sims/${simId}?${params.toString()}`,
    );
    const dataPoints = normalizeAirStatsDataPoints(await response.json());

    return {
      imsi: simId,
      dataPoints,
      period,
    };
  }

  /**
   * Harvest Dataからデバイスデータを取得します
   *
   * @param imsi - IMSI
   * @param from - 開始日時（UNIXタイムスタンプミリ秒）
   * @param to - 終了日時（UNIXタイムスタンプミリ秒）
   * @param sort - ソート順（"asc" または "desc"）
   * @param limit - 取得件数（デフォルト: 100）
   * @returns Harvest Dataエントリ一覧
   * @throws {Error} API呼び出しに失敗した場合
   *
   * @example
   * ```typescript
   * const now = Date.now();
   * const oneHourAgo = now - 60 * 60 * 1000;
   * const data = await client.getHarvestData("44010...", oneHourAgo, now);
   * ```
   */
  async getHarvestData(
    imsi: string,
    from: number,
    to: number,
    sort: "asc" | "desc" = "desc",
    limit = 100,
  ): Promise<HarvestDataResult> {
    const params = new URLSearchParams({
      from: String(from),
      to: String(to),
      sort,
      limit: String(limit),
    });

    const response = await this.request(
      `/data/Subscriber/${imsi}?${params.toString()}`,
    );
    const entries: HarvestDataEntry[] = await response.json();

    return { imsi, entries };
  }

  /**
   * ソラカメデバイス一覧を取得します
   *
   * @returns ソラカメデバイス一覧
   * @throws {Error} API呼び出しに失敗した場合
   *
   * @example
   * ```typescript
   * const devices = await client.listSoraCamDevices();
   * console.log(`デバイス数: ${devices.length}`);
   * ```
   */
  async listSoraCamDevices(): Promise<SoraCamDevice[]> {
    const response = await this.request("/sora_cam/devices");
    const devices: SoraCamDevice[] = await response.json();
    return devices;
  }

  /**
   * 指定したソラカメデバイスの録画区間とイベント一覧を取得します
   *
   * @param deviceId - デバイスID
   * @param from - 開始日時（UNIXタイムスタンプミリ秒）
   * @param to - 終了日時（UNIXタイムスタンプミリ秒）
   * @param sort - ソート順（"desc" または "asc"）
   * @returns 録画区間とイベント一覧
   * @throws {Error} API呼び出しに失敗した場合
   */
  async listSoraCamRecordingsAndEvents(
    deviceId: string,
    from?: number,
    to?: number,
    sort: "desc" | "asc" = "desc",
  ): Promise<SoraCamRecordingsAndEvents> {
    const params = new URLSearchParams({ sort });

    if (from !== undefined) {
      params.set("from", String(from));
    }
    if (to !== undefined) {
      params.set("to", String(to));
    }

    const response = await this.request(
      `/sora_cam/devices/${deviceId}/recordings_and_events?${params.toString()}`,
    );
    const data = await response.json() as Partial<SoraCamRecordingsAndEvents>;

    return {
      records: Array.isArray(data.records) ? data.records : [],
      events: Array.isArray(data.events) ? data.events : [],
    };
  }

  /**
   * 指定したソラカメデバイスのイベント一覧を取得します
   *
   * @param deviceId - デバイスID
   * @param from - 開始日時（UNIXタイムスタンプミリ秒）
   * @param to - 終了日時（UNIXタイムスタンプミリ秒）
   * @param limit - 取得件数（デフォルト: 20）
   * @returns イベント一覧
   * @throws {Error} API呼び出しに失敗した場合
   *
   * @example
   * ```typescript
   * const now = Date.now();
   * const oneHourAgo = now - 60 * 60 * 1000;
   * const events = await client.getSoraCamEvents("device-id", oneHourAgo, now);
   * ```
   */
  async getSoraCamEvents(
    deviceId: string,
    from: number,
    to: number,
    limit = 20,
  ): Promise<SoraCamEvent[]> {
    const params = new URLSearchParams({
      from: String(from),
      to: String(to),
      limit: String(limit),
    });

    const response = await this.request(
      `/sora_cam/devices/${deviceId}/events?${params.toString()}`,
    );
    const events: SoraCamEvent[] = await response.json();
    return events;
  }

  /**
   * ソラカメの録画から画像をエクスポートします
   *
   * @param deviceId - デバイスID
   * @param time - エクスポート対象の日時（UNIXタイムスタンプミリ秒）
   * @returns エクスポートリクエスト結果
   * @throws {Error} API呼び出しに失敗した場合
   *
   * @example
   * ```typescript
   * const exportResult = await client.exportSoraCamImage("device-id", Date.now());
   * console.log(`Export ID: ${exportResult.exportId}`);
   * ```
   */
  async exportSoraCamImage(
    deviceId: string,
    time: number,
  ): Promise<SoraCamImageExport> {
    const response = await this.request(
      `/sora_cam/devices/${deviceId}/images/exports`,
      {
        method: "POST",
        body: JSON.stringify({ time }),
      },
    );
    const result: SoraCamImageExport = await response.json();
    return result;
  }

  /**
   * ソラカメ画像エクスポートの結果を取得します
   *
   * @param deviceId - デバイスID
   * @param exportId - エクスポートID
   * @returns エクスポート結果（URLを含む）
   * @throws {Error} API呼び出しに失敗した場合
   *
   * @example
   * ```typescript
   * const result = await client.getSoraCamImageExport("device-id", "export-id");
   * if (result.status === "completed") {
   *   console.log(`画像URL: ${result.url}`);
   * }
   * ```
   */
  async getSoraCamImageExport(
    deviceId: string,
    exportId: string,
  ): Promise<SoraCamImageExport> {
    const response = await this.request(
      `/sora_cam/devices/${deviceId}/images/exports/${exportId}`,
    );
    const result: SoraCamImageExport = await response.json();
    return result;
  }
}

/**
 * 環境変数からSoracomクライアントを生成します
 *
 * 必要な環境変数:
 * - SORACOM_AUTH_KEY_ID: 認証キーID
 * - SORACOM_AUTH_KEY: 認証キーシークレット
 * - SORACOM_COVERAGE_TYPE: カバレッジタイプ（"jp" または "g"、デフォルト: "jp"）
 *
 * @returns SoracomClient インスタンス
 * @throws {Error} 必須の環境変数が設定されていない場合
 *
 * @example
 * ```typescript
 * const client = createSoracomClientFromEnv();
 * const sims = await client.listSims();
 * ```
 */
export function createSoracomClientFromEnv(env?: EnvVars): SoracomClient {
  const authKeyId = getRuntimeEnv("SORACOM_AUTH_KEY_ID", env);
  const authKey = getRuntimeEnv("SORACOM_AUTH_KEY", env);
  const coverageType = (getRuntimeEnv("SORACOM_COVERAGE_TYPE", env) || "jp") as
    | "jp"
    | "g";

  if (!authKeyId) {
    throw new Error(
      t("soracom.errors.missing_env", { name: "SORACOM_AUTH_KEY_ID" }),
    );
  }
  if (!authKey) {
    throw new Error(
      t("soracom.errors.missing_env", { name: "SORACOM_AUTH_KEY" }),
    );
  }

  return new SoracomClient({ authKeyId, authKey, coverageType });
}
