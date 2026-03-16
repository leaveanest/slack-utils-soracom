import { Manifest } from "deno-slack-sdk/mod.ts";
import { SoracomListSimsFunctionDefinition } from "./functions/soracom_list_sims/mod.ts";
import { SoracomGetSimFunctionDefinition } from "./functions/soracom_get_sim/mod.ts";
import { SoracomGetAirUsageFunctionDefinition } from "./functions/soracom_get_air_usage/mod.ts";
import { SoracomGetHarvestDataFunctionDefinition } from "./functions/soracom_get_harvest_data/mod.ts";
import { SoracomListSoraCamDevicesFunctionDefinition } from "./functions/soracom_list_soracam_devices/mod.ts";
import { SoracomGetSoraCamEventsFunctionDefinition } from "./functions/soracom_get_soracam_events/mod.ts";
import { SoracomExportSoraCamImageFunctionDefinition } from "./functions/soracom_export_soracam_image/mod.ts";
import { SoracomSimAnomalyAlertFunctionDefinition } from "./functions/soracom_sim_anomaly_alert/mod.ts";
import { SoracomSoraCamMotionCaptureFunctionDefinition } from "./functions/soracom_soracam_motion_capture/mod.ts";
import { SoracomSimUsageReportFunctionDefinition } from "./functions/soracom_sim_usage_report/mod.ts";
import { Co2DailyAirQualityReportFunctionDefinition } from "./functions/co2_daily_air_quality_report/mod.ts";
import { MeetingRoomAirQualityReviewFunctionDefinition } from "./functions/meeting_room_air_quality_review/mod.ts";
import { VentilationEffectReviewFunctionDefinition } from "./functions/ventilation_effect_review/mod.ts";
import { Co2SpikeWithSnapshotFunctionDefinition } from "./functions/co2_spike_with_snapshot/mod.ts";
import { VentilationCheckWithCameraFunctionDefinition } from "./functions/ventilation_check_with_camera/mod.ts";
import { EnvironmentAndCameraDailyDigestFunctionDefinition } from "./functions/environment_and_camera_daily_digest/mod.ts";
import { SoracomUpdateConfigFunctionDefinition } from "./functions/soracom_update_config/mod.ts";
import { SoracomUpdateSensorProfileFunctionDefinition } from "./functions/soracom_update_sensor_profile/mod.ts";
import SoracomListSimsWorkflow from "./workflows/soracom_list_sims_workflow.ts";
import SoracomGetSimWorkflow from "./workflows/soracom_get_sim_workflow.ts";
import SoracomGetAirUsageWorkflow from "./workflows/soracom_get_air_usage_workflow.ts";
import SoracomGetHarvestDataWorkflow from "./workflows/soracom_get_harvest_data_workflow.ts";
import SoracomListSoraCamDevicesWorkflow from "./workflows/soracom_list_soracam_devices_workflow.ts";
import SoracomGetSoraCamEventsWorkflow from "./workflows/soracom_get_soracam_events_workflow.ts";
import SoracomExportSoraCamImageWorkflow from "./workflows/soracom_export_soracam_image_workflow.ts";
import SoracomSimAnomalyAlertWorkflow from "./workflows/soracom_sim_anomaly_alert_workflow.ts";
import SoracomSoraCamMotionCaptureWorkflow from "./workflows/soracom_soracam_motion_capture_workflow.ts";
import SoracomSimUsageReportWorkflow from "./workflows/soracom_sim_usage_report_workflow.ts";
import Co2DailyAirQualityReportWorkflow from "./workflows/co2_daily_air_quality_report_workflow.ts";
import MeetingRoomAirQualityReviewWorkflow from "./workflows/meeting_room_air_quality_review_workflow.ts";
import VentilationEffectReviewWorkflow from "./workflows/ventilation_effect_review_workflow.ts";
import Co2SpikeWithSnapshotWorkflow from "./workflows/co2_spike_with_snapshot_workflow.ts";
import VentilationCheckWithCameraWorkflow from "./workflows/ventilation_check_with_camera_workflow.ts";
import EnvironmentAndCameraDailyDigestWorkflow from "./workflows/environment_and_camera_daily_digest_workflow.ts";
import SoracomUpdateConfigWorkflow from "./workflows/soracom_update_config_workflow.ts";
import SoracomUpdateSensorProfileWorkflow from "./workflows/soracom_update_sensor_profile_workflow.ts";
import SoracomConfigDatastore from "./datastores/soracom_config.ts";
import SoracomSensorProfilesDatastore from "./datastores/soracom_sensor_profiles.ts";

// Load from environment variables with fallback defaults
const APP_NAME = Deno.env.get("SLACK_APP_NAME") || "Slack Utils Template";
const APP_DESCRIPTION = Deno.env.get("SLACK_APP_DESCRIPTION") ||
  "A template for Slack workflow development";

export default Manifest({
  name: APP_NAME,
  description: APP_DESCRIPTION,
  icon: "assets/icon.png",
  workflows: [
    // SIM管理
    SoracomListSimsWorkflow,
    SoracomGetSimWorkflow,
    SoracomGetAirUsageWorkflow,
    // Harvest Data
    SoracomGetHarvestDataWorkflow,
    // ソラカメ
    SoracomListSoraCamDevicesWorkflow,
    SoracomGetSoraCamEventsWorkflow,
    SoracomExportSoraCamImageWorkflow,
    // 複合ワークフロー
    SoracomSimAnomalyAlertWorkflow,
    SoracomSoraCamMotionCaptureWorkflow,
    SoracomSimUsageReportWorkflow,
    Co2DailyAirQualityReportWorkflow,
    MeetingRoomAirQualityReviewWorkflow,
    VentilationEffectReviewWorkflow,
    Co2SpikeWithSnapshotWorkflow,
    VentilationCheckWithCameraWorkflow,
    EnvironmentAndCameraDailyDigestWorkflow,
    // 設定管理
    SoracomUpdateConfigWorkflow,
    SoracomUpdateSensorProfileWorkflow,
  ],
  datastores: [
    SoracomConfigDatastore,
    SoracomSensorProfilesDatastore,
  ],
  functions: [
    // SIM管理
    SoracomListSimsFunctionDefinition,
    SoracomGetSimFunctionDefinition,
    SoracomGetAirUsageFunctionDefinition,
    // Harvest Data
    SoracomGetHarvestDataFunctionDefinition,
    // ソラカメ
    SoracomListSoraCamDevicesFunctionDefinition,
    SoracomGetSoraCamEventsFunctionDefinition,
    SoracomExportSoraCamImageFunctionDefinition,
    // 複合ワークフロー
    SoracomSimAnomalyAlertFunctionDefinition,
    SoracomSoraCamMotionCaptureFunctionDefinition,
    SoracomSimUsageReportFunctionDefinition,
    Co2DailyAirQualityReportFunctionDefinition,
    MeetingRoomAirQualityReviewFunctionDefinition,
    VentilationEffectReviewFunctionDefinition,
    Co2SpikeWithSnapshotFunctionDefinition,
    VentilationCheckWithCameraFunctionDefinition,
    EnvironmentAndCameraDailyDigestFunctionDefinition,
    // 設定管理
    SoracomUpdateConfigFunctionDefinition,
    SoracomUpdateSensorProfileFunctionDefinition,
  ],
  outgoingDomains: [
    "api.soracom.io",
    "g.api.soracom.io",
  ],
  botScopes: [
    "commands",
    "chat:write",
    "channels:read",
    "groups:read",
    "users:read",
    "datastore:read",
    "datastore:write",
  ],
});
