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
import { formatLocalizedDateTime, t } from "../i18n/mod.ts";
import { runWithImmediateRetry } from "./immediate_retry.ts";
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
  name?: string;
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

interface RawHarvestDataEntry {
  time?: number;
  content?: unknown;
  contentType?: string;
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

function normalizeUnixTimestampMilliseconds(
  timestamp: number | undefined,
): number {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return 0;
  }

  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
}

interface RawSoraCamRecordingEvent {
  type?: string;
  startTime?: number;
  endTime?: number;
}

interface RawSoraCamDevice {
  connected?: boolean;
  connectionStatus?: string;
  deviceId?: string;
  firmwareVersion?: string;
  lastConnectedTime?: number | string;
  name?: string;
  status?: string;
}

class RetryableSoraCamExportStatusError extends Error {
  response: Response;

  constructor(response: Response) {
    super(`Retryable SoraCam export status response: ${response.status}`);
    this.response = response;
  }
}

/** APIベースURL */
const BASE_URLS: Record<string, string> = {
  jp: "https://api.soracom.io/v1",
  g: "https://g.api.soracom.io/v1",
};
const HARVEST_DATA_MAX_LIMIT = 1000;

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
    ...(rawSim.name ? { name: rawSim.name } : {}),
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
        date: normalizeUnixTimestampMilliseconds(rawPoint.unixtime),
        ...totals,
      };
    }

    return {
      date: normalizeUnixTimestampMilliseconds(
        typeof rawPoint.date === "number" ? rawPoint.date : undefined,
      ),
      uploadByteSizeTotal: rawPoint.uploadByteSizeTotal ?? 0,
      downloadByteSizeTotal: rawPoint.downloadByteSizeTotal ?? 0,
      uploadPacketSizeTotal: rawPoint.uploadPacketSizeTotal ?? 0,
      downloadPacketSizeTotal: rawPoint.downloadPacketSizeTotal ?? 0,
    };
  });
}

function normalizeSoraCamRecordingEvents(
  deviceId: string,
  rawEvents: RawSoraCamRecordingEvent[],
): SoraCamEvent[] {
  return rawEvents
    .filter((event) =>
      typeof event.type === "string" &&
      typeof event.startTime === "number"
    )
    .sort((left, right) => (right.startTime ?? 0) - (left.startTime ?? 0))
    .map((event) => ({
      deviceId,
      eventType: event.type!,
      eventTime: event.startTime!,
      eventInfo: typeof event.endTime === "number"
        ? { endTime: event.endTime }
        : {},
    }));
}

function normalizeSoraCamDeviceStatus(rawDevice: RawSoraCamDevice): string {
  if (typeof rawDevice.status === "string" && rawDevice.status.length > 0) {
    return rawDevice.status;
  }

  if (
    typeof rawDevice.connectionStatus === "string" &&
    rawDevice.connectionStatus.length > 0
  ) {
    return rawDevice.connectionStatus;
  }

  if (typeof rawDevice.connected === "boolean") {
    return rawDevice.connected ? "online" : "offline";
  }

  return "-";
}

function normalizeSoraCamDeviceLastConnectedTime(
  rawDevice: RawSoraCamDevice,
): number {
  if (
    typeof rawDevice.lastConnectedTime === "number" &&
    Number.isFinite(rawDevice.lastConnectedTime)
  ) {
    return rawDevice.lastConnectedTime;
  }

  if (typeof rawDevice.lastConnectedTime === "string") {
    const parsed = Number(rawDevice.lastConnectedTime);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function normalizeSoraCamDevices(payload: unknown): SoraCamDevice[] {
  if (!Array.isArray(payload)) {
    throw new Error("Unexpected sora cam devices response format");
  }

  return payload
    .map((entry) => {
      const rawDevice = entry as RawSoraCamDevice;
      if (
        typeof rawDevice.deviceId !== "string" ||
        rawDevice.deviceId.length === 0
      ) {
        return null;
      }

      return {
        deviceId: rawDevice.deviceId,
        name: typeof rawDevice.name === "string" ? rawDevice.name : "",
        status: normalizeSoraCamDeviceStatus(rawDevice),
        firmwareVersion: typeof rawDevice.firmwareVersion === "string"
          ? rawDevice.firmwareVersion
          : "",
        lastConnectedTime: normalizeSoraCamDeviceLastConnectedTime(rawDevice),
      } satisfies SoraCamDevice;
    })
    .filter((device): device is SoraCamDevice => device !== null);
}

function normalizeHarvestDataContent(
  content: unknown,
  contentType?: string,
): unknown {
  if (
    typeof content === "string" &&
    typeof contentType === "string" &&
    contentType.toLowerCase().includes("application/json")
  ) {
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }

  return content;
}

function normalizeHarvestDataEntries(payload: unknown): HarvestDataEntry[] {
  if (!Array.isArray(payload)) {
    throw new Error("Unexpected harvest data response format");
  }

  return payload
    .map((entry) => {
      const rawEntry = entry as RawHarvestDataEntry;
      const time = rawEntry.time;
      const contentType = rawEntry.contentType;
      if (
        typeof time !== "number" ||
        !Number.isFinite(time) ||
        typeof contentType !== "string"
      ) {
        return null;
      }

      return {
        time,
        contentType,
        content: normalizeHarvestDataContent(
          rawEntry.content,
          contentType,
        ),
      } satisfies HarvestDataEntry;
    })
    .filter((entry): entry is HarvestDataEntry => entry !== null);
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

  private async ensureAuthenticated(): Promise<void> {
    if (!this.apiKey || !this.token) {
      await this.authenticate();
    }
  }

  private async fetchAuthorized(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    return await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "X-Soracom-API-Key": this.apiKey!,
        "X-Soracom-Token": this.token!,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  }

  private async createApiRequestError(response: Response): Promise<Error> {
    const errorBody: SoracomApiError = await response.json().catch(() => ({
      code: "unknown",
      message: response.statusText,
    }));

    return new Error(
      t("soracom.errors.api_request_failed", {
        status: response.status,
        message: errorBody.message,
      }),
    );
  }

  private async createSoraCamImageExportRequestError(
    response: Response,
    deviceId: string,
    time: number,
  ): Promise<Error> {
    if (response.status === 404) {
      return new Error(
        t("soracom.errors.soracam_recording_not_found_for_time", {
          deviceId,
          time: formatLocalizedDateTime(time),
        }),
      );
    }

    return await this.createApiRequestError(response);
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
    await this.ensureAuthenticated();

    const response = await this.fetchAuthorized(path, options);

    if (!response.ok) {
      throw await this.createApiRequestError(response);
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
    const nextKey = response.headers.get("x-soracom-next-key") ?? undefined;

    return {
      sims,
      total: sims.length,
      nextKey,
    };
  }

  /**
   * すべての SIM 一覧を取得します。
   *
   * `x-soracom-next-key` ヘッダーをたどってページネーションを継続します。
   *
   * @param pageSize - 1ページあたりの取得件数（デフォルト: 100）
   * @returns 全 SIM 一覧
   * @throws {Error} ページネーションが不正な場合、またはAPI呼び出しに失敗した場合
   */
  async listAllSims(pageSize = 100): Promise<SoracomSim[]> {
    const sims: SoracomSim[] = [];
    const seenKeys = new Set<string>();
    let nextKey: string | undefined;

    while (true) {
      const page = await this.listSims(pageSize, nextKey);
      sims.push(...page.sims);

      if (!page.nextKey) {
        return sims;
      }

      if (seenKeys.has(page.nextKey)) {
        throw new Error(
          "Unexpected duplicate pagination key while listing SIMs",
        );
      }

      seenKeys.add(page.nextKey);
      nextKey = page.nextKey;
    }
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
   * Harvest Dataから指定期間のデバイスデータを全件取得します。
   *
   * @param imsi - IMSI
   * @param from - 開始日時（UNIXタイムスタンプミリ秒）
   * @param to - 終了日時（UNIXタイムスタンプミリ秒）
   * @param sort - ソート順（"asc" または "desc"）
   * @param limit - 1回の API 呼び出しで取得する件数（デフォルト: 1000）
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
    limit = HARVEST_DATA_MAX_LIMIT,
  ): Promise<HarvestDataResult> {
    const pageSize = Math.min(
      Math.max(Math.trunc(limit), 1),
      HARVEST_DATA_MAX_LIMIT,
    );
    const entries: HarvestDataEntry[] = [];

    let nextFrom = from;
    let nextTo = to;

    while (nextFrom <= nextTo) {
      const batch = await this.getHarvestDataPage(
        imsi,
        nextFrom,
        nextTo,
        sort,
        pageSize,
      );
      if (batch.length === 0) {
        break;
      }

      entries.push(...batch);

      if (batch.length < pageSize) {
        break;
      }

      const edgeTime = sort === "asc"
        ? batch[batch.length - 1].time + 1
        : batch[batch.length - 1].time - 1;

      if (!Number.isFinite(edgeTime)) {
        break;
      }

      if (sort === "asc") {
        if (edgeTime <= nextFrom) {
          throw new Error("Harvest data pagination did not advance");
        }
        nextFrom = edgeTime;
      } else {
        if (edgeTime >= nextTo) {
          throw new Error("Harvest data pagination did not advance");
        }
        nextTo = edgeTime;
      }
    }

    return { imsi, entries };
  }

  private async getHarvestDataPage(
    imsi: string,
    from: number,
    to: number,
    sort: "asc" | "desc",
    limit: number,
  ): Promise<HarvestDataEntry[]> {
    const params = new URLSearchParams({
      from: String(from),
      to: String(to),
      sort,
      limit: String(limit),
    });

    const response = await this.request(
      `/data/Subscriber/${imsi}?${params.toString()}`,
    );

    return normalizeHarvestDataEntries(await response.json());
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
    return normalizeSoraCamDevices(await response.json());
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
    const parsedData = await response.json().catch(() => null) as
      | Partial<SoraCamRecordingsAndEvents>
      | null;
    const data = parsedData && typeof parsedData === "object" ? parsedData : {};

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
    const recordingsAndEvents = await this.listSoraCamRecordingsAndEvents(
      deviceId,
      from,
      to,
      "desc",
    );

    return normalizeSoraCamRecordingEvents(
      deviceId,
      recordingsAndEvents.events,
    ).slice(0, limit);
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
    await this.ensureAuthenticated();

    const response = await this.fetchAuthorized(
      `/sora_cam/devices/${deviceId}/images/exports`,
      {
        method: "POST",
        body: JSON.stringify({ time }),
      },
    );

    if (!response.ok) {
      throw await this.createSoraCamImageExportRequestError(
        response,
        deviceId,
        time,
      );
    }

    const result: SoraCamImageExport = await response.json();
    return result;
  }

  /**
   * ソラカメ画像スナップショットの結果を取得します
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
    const path = `/sora_cam/devices/${deviceId}/images/exports/${exportId}`;

    await this.ensureAuthenticated();

    try {
      const response = await runWithImmediateRetry(
        async () => {
          const response = await this.fetchAuthorized(path);

          if (!response.ok && response.status >= 500) {
            throw new RetryableSoraCamExportStatusError(response);
          }

          return response;
        },
        (error) =>
          error instanceof RetryableSoraCamExportStatusError ||
          error instanceof TypeError,
      );

      if (!response.ok) {
        throw await this.createApiRequestError(response);
      }

      const result: SoraCamImageExport = await response.json();
      return result;
    } catch (error) {
      if (error instanceof RetryableSoraCamExportStatusError) {
        throw await this.createApiRequestError(error.response);
      }

      throw error;
    }
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
