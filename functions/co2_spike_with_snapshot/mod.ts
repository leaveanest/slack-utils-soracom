import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { t } from "../../lib/i18n/mod.ts";
import {
  CONFIG_KEYS,
  createSoracomClientFromEnv,
  findLargestCo2Spike,
  getConfigValue,
} from "../../lib/soracom/mod.ts";
import type {
  AirQualitySpike,
  SoraCamImageExport,
} from "../../lib/soracom/mod.ts";
import {
  imsiSchema,
  soraCamDeviceIdSchema,
} from "../../lib/validation/schemas.ts";

const DEFAULT_LOOKBACK_HOURS = 24;
const DEFAULT_SPIKE_THRESHOLD = 300;

/**
 * CO2スパイク時刻の画像確認関数定義
 *
 * 直近の Harvest Data から CO2 変化が大きかった時刻を見つけ、
 * 近傍の SoraCam 画像を添えて Slack に投稿します。
 */
export const Co2SpikeWithSnapshotFunctionDefinition = DefineFunction({
  callback_id: "co2_spike_with_snapshot",
  title: "CO2 Spike With Snapshot",
  description:
    "Find the largest recent CO2 spike and attach a nearby SoraCam snapshot",
  source_file: "functions/co2_spike_with_snapshot/mod.ts",
  input_parameters: {
    properties: {
      imsi: {
        type: Schema.types.string,
        description: "IMSI of the subscriber (15 digits)",
      },
      device_id: {
        type: Schema.types.string,
        description: "SoraCam device ID",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "Channel to post results",
      },
      spike_threshold: {
        type: Schema.types.number,
        description: "Minimum absolute CO2 delta in ppm to treat as a spike",
      },
      lookback_hours: {
        type: Schema.types.number,
        description: "Lookback window in hours",
      },
    },
    required: ["imsi", "device_id", "channel_id"],
  },
  output_parameters: {
    properties: {
      imsi: {
        type: Schema.types.string,
        description: "IMSI",
      },
      device_id: {
        type: Schema.types.string,
        description: "SoraCam device ID",
      },
      spike_time: {
        type: Schema.types.string,
        description: "Spike time in ISO 8601",
      },
      spike_delta: {
        type: Schema.types.string,
        description: "Formatted CO2 spike delta",
      },
      image_url: {
        type: Schema.types.string,
        description: "Snapshot URL if available",
      },
      message: {
        type: Schema.types.string,
        description: "Formatted result message",
      },
    },
    required: [
      "imsi",
      "device_id",
      "spike_time",
      "spike_delta",
      "image_url",
      "message",
    ],
  },
});

/**
 * CO2スパイク確認メッセージを生成します。
 *
 * @param imsi - IMSI
 * @param deviceId - SoraCam device ID
 * @param spike - CO2 spike
 * @param exportResult - Snapshot export result
 * @param threshold - Applied spike threshold
 * @returns Formatted Slack message
 */
export function formatCo2SpikeWithSnapshotMessage(
  imsi: string,
  deviceId: string,
  spike: AirQualitySpike | null,
  exportResult: SoraCamImageExport | null,
  threshold: number,
): string {
  const header = `*${
    t("soracom.messages.co2_spike_with_snapshot_header", { imsi, deviceId })
  }*`;

  if (spike === null) {
    return [header, t("soracom.messages.co2_spike_with_snapshot_no_data")].join(
      "\n\n",
    );
  }

  if (Math.abs(spike.delta) < threshold) {
    return [
      header,
      t("soracom.messages.co2_spike_with_snapshot_below_threshold", {
        delta: formatSignedMetricNumber(spike.delta),
        threshold: formatMetricNumber(threshold),
        time: new Date(spike.currentTime).toISOString(),
      }),
    ].join("\n\n");
  }

  const lines = [
    header,
    t("soracom.messages.co2_spike_with_snapshot_spike", {
      previousTime: new Date(spike.previousTime).toISOString(),
      currentTime: new Date(spike.currentTime).toISOString(),
      previousCo2: formatMetricNumber(spike.previousCo2),
      currentCo2: formatMetricNumber(spike.currentCo2),
      delta: formatSignedMetricNumber(spike.delta),
    }),
  ];

  if (exportResult === null) {
    lines.push(t("soracom.messages.co2_spike_with_snapshot_export_skipped"));
    return lines.join("\n");
  }

  if (exportResult.status === "completed" && exportResult.url) {
    lines.push(
      t("soracom.messages.co2_spike_with_snapshot_snapshot_url", {
        url: exportResult.url,
      }),
    );
    return lines.join("\n");
  }

  lines.push(
    t("soracom.messages.co2_spike_with_snapshot_snapshot_processing", {
      exportId: exportResult.exportId,
    }),
  );
  return lines.join("\n");
}

/**
 * Formats a numeric value for display.
 *
 * @param value - Numeric value
 * @returns Formatted number
 */
function formatMetricNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(1);
}

/**
 * Formats a numeric value with explicit sign.
 *
 * @param value - Numeric value
 * @returns Signed formatted number
 */
function formatSignedMetricNumber(value: number): string {
  if (value > 0) {
    return `+${formatMetricNumber(value)}`;
  }
  if (value < 0) {
    return `-${formatMetricNumber(Math.abs(value))}`;
  }
  return "0";
}

export default SlackFunction(
  Co2SpikeWithSnapshotFunctionDefinition,
  async ({ inputs, client }) => {
    try {
      const validImsi = imsiSchema.parse(inputs.imsi);
      const validDeviceId = soraCamDeviceIdSchema.parse(inputs.device_id);
      const spikeThreshold = inputs.spike_threshold ?? DEFAULT_SPIKE_THRESHOLD;
      const lookbackHours = inputs.lookback_hours ?? DEFAULT_LOOKBACK_HOURS;

      if (
        !Number.isFinite(spikeThreshold) ||
        spikeThreshold <= 0 ||
        !Number.isFinite(lookbackHours) ||
        lookbackHours <= 0
      ) {
        throw new Error(t("errors.invalid_input"));
      }

      console.log(
        t("soracom.logs.generating_co2_spike_with_snapshot", {
          imsi: validImsi,
          deviceId: validDeviceId,
        }),
      );

      const channelId = await getConfigValue(
        client,
        CONFIG_KEYS.SORACAM_CHANNEL_ID,
        inputs.channel_id,
      );

      const soracomClient = createSoracomClientFromEnv();
      const now = Date.now();
      const lookbackStart = now - lookbackHours * 60 * 60 * 1000;
      const harvest = await soracomClient.getHarvestData(
        validImsi,
        lookbackStart,
        now,
      );

      const spike = findLargestCo2Spike(harvest.entries);
      let exportResult: SoraCamImageExport | null = null;

      if (spike !== null && Math.abs(spike.delta) >= spikeThreshold) {
        exportResult = await soracomClient.exportSoraCamImage(
          validDeviceId,
          spike.currentTime,
        );

        if (exportResult.status === "processing") {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          exportResult = await soracomClient.getSoraCamImageExport(
            validDeviceId,
            exportResult.exportId,
          );
        }
      }

      const message = formatCo2SpikeWithSnapshotMessage(
        validImsi,
        validDeviceId,
        spike,
        exportResult,
        spikeThreshold,
      );

      await client.chat.postMessage({
        channel: channelId,
        text: message,
      });

      return {
        outputs: {
          imsi: validImsi,
          device_id: validDeviceId,
          spike_time: spike ? new Date(spike.currentTime).toISOString() : "",
          spike_delta: spike ? formatSignedMetricNumber(spike.delta) : "",
          image_url: exportResult?.url ?? "",
          message,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("co2_spike_with_snapshot error:", errorMessage);
      return { error: errorMessage };
    }
  },
);
