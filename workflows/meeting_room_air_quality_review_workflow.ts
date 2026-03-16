import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { MeetingRoomAirQualityReviewFunctionDefinition } from "../functions/meeting_room_air_quality_review/mod.ts";

/**
 * 会議室空気品質振り返りワークフロー
 *
 * 指定した会議室センサーの過去24時間の Harvest Data を振り返り、
 * CO2 のピーク時間帯を含む要約を Slack に投稿します。
 */
const MeetingRoomAirQualityReviewWorkflow = DefineWorkflow({
  callback_id: "meeting_room_air_quality_review_workflow",
  title: "Meeting Room Air Quality Review",
  description: "Review meeting room air quality and highlight peak CO2 time",
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
      co2_threshold: {
        type: Schema.types.number,
        description: "CO2 alert threshold in ppm",
      },
      bucket_minutes: {
        type: Schema.types.number,
        description: "Bucket size in minutes for peak time analysis",
      },
    },
    required: ["imsi", "channel_id"],
  },
});

MeetingRoomAirQualityReviewWorkflow.addStep(
  MeetingRoomAirQualityReviewFunctionDefinition,
  {
    imsi: MeetingRoomAirQualityReviewWorkflow.inputs.imsi,
    channel_id: MeetingRoomAirQualityReviewWorkflow.inputs.channel_id,
    co2_threshold: MeetingRoomAirQualityReviewWorkflow.inputs.co2_threshold,
    bucket_minutes: MeetingRoomAirQualityReviewWorkflow.inputs.bucket_minutes,
  },
);

export default MeetingRoomAirQualityReviewWorkflow;
