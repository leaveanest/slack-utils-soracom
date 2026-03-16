import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

/**
 * SORACOMセンサープロファイル用データストア
 *
 * 日次レポート対象のセンサー設定を IMSI 単位で保存します。
 */
const SoracomSensorProfilesDatastore = DefineDatastore({
  name: "soracom_sensor_profiles",
  primary_key: "imsi",
  attributes: {
    imsi: {
      type: Schema.types.string,
      description: "Sensor IMSI",
    },
    sensor_name: {
      type: Schema.types.string,
      description: "Display name for the sensor",
    },
    report_channel_id: {
      type: Schema.slack.types.channel_id,
      description: "Channel where daily reports are posted",
    },
    co2_threshold: {
      type: Schema.types.number,
      description: "Optional CO2 threshold in ppm",
    },
    soracam_device_id: {
      type: Schema.types.string,
      description: "Optional paired SoraCam device ID",
    },
    lookback_hours: {
      type: Schema.types.number,
      description: "Optional lookback window in hours for digests",
    },
    updated_by: {
      type: Schema.slack.types.user_id,
      description: "User who last updated this sensor profile",
    },
    updated_at: {
      type: Schema.types.string,
      description: "Last updated timestamp (ISO 8601)",
    },
  },
});

export default SoracomSensorProfilesDatastore;
