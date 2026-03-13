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

import { t } from "../i18n/mod.ts";
import type {
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

/** APIベースURL */
const BASE_URLS: Record<string, string> = {
  jp: "https://api.soracom.io/v1",
  g: "https://g.api.soracom.io/v1",
};

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
    const sims: SoracomSim[] = await response.json();

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
    const sim: SoracomSim = await response.json();
    return sim;
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
    const dataPoints: AirStatsDataPoint[] = await response.json();

    return {
      imsi,
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
export function createSoracomClientFromEnv(): SoracomClient {
  const authKeyId = Deno.env.get("SORACOM_AUTH_KEY_ID");
  const authKey = Deno.env.get("SORACOM_AUTH_KEY");
  const coverageType = (Deno.env.get("SORACOM_COVERAGE_TYPE") || "jp") as
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
