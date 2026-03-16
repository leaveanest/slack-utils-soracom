import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { VentilationCheckWithCameraFunctionDefinition } from "../functions/ventilation_check_with_camera/mod.ts";

/**
 * 換気確認とカメラ画像確認ワークフロー
 */
const VentilationCheckWithCameraWorkflow = DefineWorkflow({
  callback_id: "ventilation_check_with_camera_workflow",
  title: "Ventilation Check With Camera",
  description: "Review ventilation effect and attach a nearby camera snapshot",
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
      reference_time: {
        type: Schema.types.string,
        description: "Reference time in ISO 8601 format",
      },
      before_minutes: {
        type: Schema.types.number,
        description: "Window length before the reference time in minutes",
      },
      after_minutes: {
        type: Schema.types.number,
        description: "Window length after the reference time in minutes",
      },
      co2_threshold: {
        type: Schema.types.number,
        description: "CO2 alert threshold in ppm",
      },
    },
    required: ["imsi", "device_id", "channel_id", "reference_time"],
  },
});

VentilationCheckWithCameraWorkflow.addStep(
  VentilationCheckWithCameraFunctionDefinition,
  {
    imsi: VentilationCheckWithCameraWorkflow.inputs.imsi,
    device_id: VentilationCheckWithCameraWorkflow.inputs.device_id,
    channel_id: VentilationCheckWithCameraWorkflow.inputs.channel_id,
    reference_time: VentilationCheckWithCameraWorkflow.inputs.reference_time,
    before_minutes: VentilationCheckWithCameraWorkflow.inputs.before_minutes,
    after_minutes: VentilationCheckWithCameraWorkflow.inputs.after_minutes,
    co2_threshold: VentilationCheckWithCameraWorkflow.inputs.co2_threshold,
  },
);

export default VentilationCheckWithCameraWorkflow;
