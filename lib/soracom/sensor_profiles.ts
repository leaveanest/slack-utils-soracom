import { t } from "../i18n/mod.ts";
import SoracomSensorProfilesDatastore from "../../datastores/soracom_sensor_profiles.ts";
import type { SoracomSensorProfile } from "./types.ts";

interface SensorProfileDatastoreClient {
  apps: {
    datastore: {
      put: (params: {
        datastore: string;
        item: Record<string, unknown>;
      }) => Promise<{ ok: boolean; error?: string }>;
      query: (params: {
        datastore: string;
      }) => Promise<{
        ok: boolean;
        items?: Array<Record<string, unknown>>;
        error?: string;
      }>;
    };
  };
}

export type SoracomSensorProfileInput = {
  imsi: string;
  sensorName: string;
  reportChannelId: string;
  co2Threshold?: number;
  soraCamDeviceId?: string;
  lookbackHours?: number;
};

/**
 * センサープロファイルを Datastore に保存します。
 *
 * @param client - Slack APIクライアント
 * @param profile - 保存対象のセンサープロファイル
 * @param userId - 更新者のユーザーID
 * @throws {Error} 保存に失敗した場合
 */
export async function upsertSensorProfile(
  client: SensorProfileDatastoreClient,
  profile: SoracomSensorProfileInput,
  userId: string,
): Promise<void> {
  const result = await client.apps.datastore.put({
    datastore: SoracomSensorProfilesDatastore.definition.name,
    item: {
      imsi: profile.imsi,
      sensor_name: profile.sensorName,
      report_channel_id: profile.reportChannelId,
      ...(profile.co2Threshold === undefined
        ? {}
        : { co2_threshold: profile.co2Threshold }),
      ...(profile.soraCamDeviceId === undefined
        ? {}
        : { soracam_device_id: profile.soraCamDeviceId }),
      ...(profile.lookbackHours === undefined
        ? {}
        : { lookback_hours: profile.lookbackHours }),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
  });

  if (!result.ok) {
    throw new Error(
      t("soracom.errors.sensor_profile_datastore_write_failed", {
        imsi: profile.imsi,
        error: result.error ?? "unknown_error",
      }),
    );
  }
}

/**
 * 登録済みのセンサープロファイル一覧を取得します。
 *
 * 形が不正なレコードは無視します。
 *
 * @param client - Slack APIクライアント
 * @returns 正規化済みセンサープロファイル一覧
 */
export async function listSensorProfiles(
  client: SensorProfileDatastoreClient,
): Promise<SoracomSensorProfile[]> {
  const result = await client.apps.datastore.query({
    datastore: SoracomSensorProfilesDatastore.definition.name,
  });

  if (!result.ok || !result.items) {
    return [];
  }

  return result.items
    .map((item) => normalizeSensorProfile(item))
    .filter((item): item is SoracomSensorProfile => item !== null)
    .sort((left, right) =>
      left.sensorName.localeCompare(right.sensorName) ||
      left.imsi.localeCompare(right.imsi)
    );
}

function normalizeSensorProfile(
  item: Record<string, unknown>,
): SoracomSensorProfile | null {
  const imsi = readString(item.imsi);
  const sensorName = readString(item.sensor_name);
  const reportChannelId = readString(item.report_channel_id);

  if (imsi === null || sensorName === null || reportChannelId === null) {
    return null;
  }

  return {
    imsi,
    sensorName,
    reportChannelId,
    co2Threshold: readNumber(item.co2_threshold),
    soraCamDeviceId: readString(item.soracam_device_id) ?? undefined,
    lookbackHours: readNumber(item.lookback_hours),
    updatedBy: readString(item.updated_by) ?? undefined,
    updatedAt: readString(item.updated_at) ?? undefined,
  };
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
