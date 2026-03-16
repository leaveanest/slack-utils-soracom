import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { t } from "../../lib/i18n/mod.ts";
import { upsertSensorProfile } from "../../lib/soracom/mod.ts";
import {
  channelIdSchema,
  imsiSchema,
  nonEmptyStringSchema,
  soraCamDeviceIdSchema,
} from "../../lib/validation/schemas.ts";

/**
 * センサープロファイル更新関数定義
 *
 * 日次レポート対象のセンサー設定を Datastore に保存します。
 */
export const SoracomUpdateSensorProfileFunctionDefinition = DefineFunction({
  callback_id: "soracom_update_sensor_profile",
  title: "Soracom Update Sensor Profile",
  description: "Save a daily-report sensor profile into the datastore",
  source_file: "functions/soracom_update_sensor_profile/mod.ts",
  input_parameters: {
    properties: {
      sensor_name: {
        type: Schema.types.string,
        description: "Display name for the sensor",
      },
      imsi: {
        type: Schema.types.string,
        description: "IMSI of the subscriber (15 digits)",
      },
      report_channel_id: {
        type: Schema.slack.types.channel_id,
        description: "Channel where daily reports will be posted",
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
        description: "Optional digest lookback window in hours",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "Channel to post the confirmation message",
      },
      user_id: {
        type: Schema.slack.types.user_id,
        description: "User who triggered the update",
      },
    },
    required: [
      "sensor_name",
      "imsi",
      "report_channel_id",
      "channel_id",
      "user_id",
    ],
  },
  output_parameters: {
    properties: {
      imsi: {
        type: Schema.types.string,
        description: "IMSI",
      },
      sensor_name: {
        type: Schema.types.string,
        description: "Display name for the sensor",
      },
      message: {
        type: Schema.types.string,
        description: "Confirmation message",
      },
    },
    required: ["imsi", "sensor_name", "message"],
  },
});

export type SensorProfileFormInput = {
  sensorName: string;
  imsi: string;
  reportChannelId: string;
  co2Threshold?: number;
  soraCamDeviceId?: string;
  lookbackHours?: number;
};

/**
 * 入力を正規化し、センサープロファイル保存用の値に変換します。
 *
 * @param inputs - Workflow入力
 * @returns 正規化済みセンサープロファイル入力
 */
export function normalizeSensorProfileInputs(
  inputs: {
    sensor_name: string;
    imsi: string;
    report_channel_id: string;
    co2_threshold?: number;
    soracam_device_id?: string;
    lookback_hours?: number;
  },
): SensorProfileFormInput {
  const sensorName = nonEmptyStringSchema.parse(inputs.sensor_name.trim());
  const imsi = imsiSchema.parse(inputs.imsi);
  const reportChannelId = channelIdSchema.parse(inputs.report_channel_id);
  const soraCamDeviceId = inputs.soracam_device_id?.trim();

  if (
    inputs.co2_threshold !== undefined &&
    (!Number.isFinite(inputs.co2_threshold) || inputs.co2_threshold <= 0)
  ) {
    throw new Error(t("errors.invalid_input"));
  }

  if (
    inputs.lookback_hours !== undefined &&
    (!Number.isFinite(inputs.lookback_hours) || inputs.lookback_hours <= 0)
  ) {
    throw new Error(t("errors.invalid_input"));
  }

  return {
    sensorName,
    imsi,
    reportChannelId,
    co2Threshold: inputs.co2_threshold,
    soraCamDeviceId: soraCamDeviceId
      ? soraCamDeviceIdSchema.parse(soraCamDeviceId)
      : undefined,
    lookbackHours: inputs.lookback_hours,
  };
}

/**
 * 保存完了メッセージを生成します。
 *
 * @param profile - 保存済みセンサープロファイル
 * @returns フォーマット済みメッセージ
 */
export function formatSensorProfileSavedMessage(
  profile: SensorProfileFormInput,
): string {
  const lines = [
    t("soracom.messages.sensor_profile_updated", {
      sensorName: profile.sensorName,
      imsi: profile.imsi,
    }),
    t("soracom.messages.sensor_profile_report_channel", {
      channelId: profile.reportChannelId,
    }),
  ];

  if (profile.co2Threshold !== undefined) {
    lines.push(
      t("soracom.messages.sensor_profile_co2_threshold", {
        threshold: formatNumber(profile.co2Threshold),
      }),
    );
  }

  if (profile.soraCamDeviceId !== undefined) {
    lines.push(
      t("soracom.messages.sensor_profile_soracam_device_id", {
        deviceId: profile.soraCamDeviceId,
      }),
    );
  }

  if (profile.lookbackHours !== undefined) {
    lines.push(
      t("soracom.messages.sensor_profile_lookback_hours", {
        hours: formatNumber(profile.lookbackHours),
      }),
    );
  }

  return lines.join("\n");
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(1);
}

export default SlackFunction(
  SoracomUpdateSensorProfileFunctionDefinition,
  async ({ inputs, client }) => {
    try {
      console.log(
        t("soracom.logs.updating_sensor_profile", {
          imsi: inputs.imsi,
        }),
      );

      const profile = normalizeSensorProfileInputs(inputs);

      await upsertSensorProfile(client, profile, inputs.user_id);

      const message = formatSensorProfileSavedMessage(profile);

      await client.chat.postMessage({
        channel: inputs.channel_id,
        text: message,
      });

      return {
        outputs: {
          imsi: profile.imsi,
          sensor_name: profile.sensorName,
          message,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("soracom_update_sensor_profile error:", errorMessage);
      return { error: errorMessage };
    }
  },
);
