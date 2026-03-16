import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { VentilationEffectReviewFunctionDefinition } from "../functions/ventilation_effect_review/mod.ts";

/**
 * 換気効果振り返りワークフロー
 *
 * 指定時刻の前後で空気品質を比較し、換気対応の効果を Slack に投稿します。
 */
const VentilationEffectReviewWorkflow = DefineWorkflow({
  callback_id: "ventilation_effect_review_workflow",
  title: "Ventilation Effect Review",
  description: "Compare air quality before and after a ventilation event",
  input_parameters: {
    properties: {
      imsi: {
        type: Schema.types.string,
        description: "IMSI of the subscriber (15 digits)",
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
    required: ["imsi", "channel_id", "reference_time"],
  },
});

VentilationEffectReviewWorkflow.addStep(
  VentilationEffectReviewFunctionDefinition,
  {
    imsi: VentilationEffectReviewWorkflow.inputs.imsi,
    channel_id: VentilationEffectReviewWorkflow.inputs.channel_id,
    reference_time: VentilationEffectReviewWorkflow.inputs.reference_time,
    before_minutes: VentilationEffectReviewWorkflow.inputs.before_minutes,
    after_minutes: VentilationEffectReviewWorkflow.inputs.after_minutes,
    co2_threshold: VentilationEffectReviewWorkflow.inputs.co2_threshold,
  },
);

export default VentilationEffectReviewWorkflow;
