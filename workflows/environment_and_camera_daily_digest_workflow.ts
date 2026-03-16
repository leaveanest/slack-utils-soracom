import { DefineWorkflow } from "deno-slack-sdk/mod.ts";
import { EnvironmentAndCameraDailyDigestFunctionDefinition } from "../functions/environment_and_camera_daily_digest/mod.ts";

/**
 * 環境とカメラの日次ダイジェストワークフロー
 */
const EnvironmentAndCameraDailyDigestWorkflow = DefineWorkflow({
  callback_id: "environment_and_camera_daily_digest_workflow",
  title: "Environment And Camera Daily Digest",
  description:
    "Summarize daily air quality and camera activity for configured sensors",
  input_parameters: {
    properties: {},
    required: [],
  },
});

EnvironmentAndCameraDailyDigestWorkflow.addStep(
  EnvironmentAndCameraDailyDigestFunctionDefinition,
  {},
);

export default EnvironmentAndCameraDailyDigestWorkflow;
