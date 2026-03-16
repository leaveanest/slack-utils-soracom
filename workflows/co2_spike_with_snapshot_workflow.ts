import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { Co2SpikeWithSnapshotFunctionDefinition } from "../functions/co2_spike_with_snapshot/mod.ts";

/**
 * CO2スパイク時刻の画像確認ワークフロー
 *
 * 指定した CO2 センサーと SoraCam デバイスを組み合わせ、
 * 直近の大きな CO2 変化に近い時刻の画像を確認します。
 */
const Co2SpikeWithSnapshotWorkflow = DefineWorkflow({
  callback_id: "co2_spike_with_snapshot_workflow",
  title: "CO2 Spike With Snapshot",
  description: "Attach a SoraCam snapshot to the largest recent CO2 spike",
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
        description: "Target channel for reports",
      },
      spike_threshold: {
        type: Schema.types.number,
        description: "Minimum absolute CO2 delta in ppm",
      },
      lookback_hours: {
        type: Schema.types.number,
        description: "Lookback window in hours",
      },
    },
    required: ["imsi", "device_id", "channel_id"],
  },
});

Co2SpikeWithSnapshotWorkflow.addStep(
  Co2SpikeWithSnapshotFunctionDefinition,
  {
    imsi: Co2SpikeWithSnapshotWorkflow.inputs.imsi,
    device_id: Co2SpikeWithSnapshotWorkflow.inputs.device_id,
    channel_id: Co2SpikeWithSnapshotWorkflow.inputs.channel_id,
    spike_threshold: Co2SpikeWithSnapshotWorkflow.inputs.spike_threshold,
    lookback_hours: Co2SpikeWithSnapshotWorkflow.inputs.lookback_hours,
  },
);

export default Co2SpikeWithSnapshotWorkflow;
