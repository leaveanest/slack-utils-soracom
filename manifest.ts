import { Manifest } from "deno-slack-sdk/mod.ts";
import { SoracomGetHarvestDataFunctionDefinition } from "./functions/soracom_get_harvest_data/mod.ts";
import { SoracomListSoraCamDevicesFunctionDefinition } from "./functions/soracom_list_soracam_devices/mod.ts";
import { SoracomExportSoraCamImageFunctionDefinition } from "./functions/soracom_export_soracam_image/mod.ts";
import { SoracomExportAllSoraCamImagesFunctionDefinition } from "./functions/soracom_export_all_soracam_images/mod.ts";
import { SoracomSimAnomalyAlertFunctionDefinition } from "./functions/soracom_sim_anomaly_alert/mod.ts";
import { SoracomSoraCamMotionCaptureFunctionDefinition } from "./functions/soracom_soracam_motion_capture/mod.ts";
import { SoracomSimUsageReportFunctionDefinition } from "./functions/soracom_sim_usage_report/mod.ts";
import { Co2DailyAirQualityReportFunctionDefinition } from "./functions/co2_daily_air_quality_report/mod.ts";
import { Co2AirQualityAnomalyAlertFunctionDefinition } from "./functions/co2_air_quality_anomaly_alert/mod.ts";
import { GpsMultiunitReportFunctionDefinition } from "./functions/gps_multiunit_report/mod.ts";
import { GpsMultiunitGeofenceReportFunctionDefinition } from "./functions/gps_multiunit_geofence_report/mod.ts";
import SoracomGetHarvestDataWorkflow from "./workflows/soracom_get_harvest_data_workflow.ts";
import SoracomListSoraCamDevicesWorkflow from "./workflows/soracom_list_soracam_devices_workflow.ts";
import SoracomExportSoraCamImageWorkflow from "./workflows/soracom_export_soracam_image_workflow.ts";
import SoracomExportAllSoraCamImagesWorkflow from "./workflows/soracom_export_all_soracam_images_workflow.ts";
import SoracomSimAnomalyAlertWorkflow from "./workflows/soracom_sim_anomaly_alert_workflow.ts";
import SoracomSoraCamMotionCaptureWorkflow from "./workflows/soracom_soracam_motion_capture_workflow.ts";
import SoracomSimUsageReportWorkflow from "./workflows/soracom_sim_usage_report_workflow.ts";
import Co2DailyAirQualityReportWorkflow from "./workflows/co2_daily_air_quality_report_workflow.ts";
import Co2AirQualityAnomalyAlertWorkflow from "./workflows/co2_air_quality_anomaly_alert_workflow.ts";
import GpsMultiunitReportWorkflow from "./workflows/gps_multiunit_report_workflow.ts";
import GpsMultiunitGeofenceReportWorkflow from "./workflows/gps_multiunit_geofence_report_workflow.ts";
import SoracomAllSoraCamImageExportJobsDatastore from "./datastores/soracom_all_soracam_image_export_jobs.ts";
import SoracomAllSoraCamImageExportTasksDatastore from "./datastores/soracom_all_soracam_image_export_tasks.ts";
import SoracomMotionCaptureJobsDatastore from "./datastores/soracom_motion_capture_jobs.ts";

// Load from environment variables with fallback defaults
const APP_NAME = Deno.env.get("SLACK_APP_NAME") || "Slack Utils IoT";
const APP_DESCRIPTION = Deno.env.get("SLACK_APP_DESCRIPTION") ||
  "IoT utilities for Slack";

export default Manifest({
  name: APP_NAME,
  description: APP_DESCRIPTION,
  icon: "assets/icon.png",
  workflows: [
    // Harvest Data
    SoracomGetHarvestDataWorkflow,
    // ソラカメ
    SoracomListSoraCamDevicesWorkflow,
    SoracomExportSoraCamImageWorkflow,
    SoracomExportAllSoraCamImagesWorkflow,
    // 複合ワークフロー
    SoracomSimAnomalyAlertWorkflow,
    SoracomSoraCamMotionCaptureWorkflow,
    SoracomSimUsageReportWorkflow,
    Co2DailyAirQualityReportWorkflow,
    Co2AirQualityAnomalyAlertWorkflow,
    GpsMultiunitReportWorkflow,
    GpsMultiunitGeofenceReportWorkflow,
  ],
  datastores: [
    SoracomAllSoraCamImageExportJobsDatastore,
    SoracomAllSoraCamImageExportTasksDatastore,
    SoracomMotionCaptureJobsDatastore,
  ],
  functions: [
    // Harvest Data
    SoracomGetHarvestDataFunctionDefinition,
    // ソラカメ
    SoracomListSoraCamDevicesFunctionDefinition,
    SoracomExportSoraCamImageFunctionDefinition,
    SoracomExportAllSoraCamImagesFunctionDefinition,
    // 複合ワークフロー
    SoracomSimAnomalyAlertFunctionDefinition,
    SoracomSoraCamMotionCaptureFunctionDefinition,
    SoracomSimUsageReportFunctionDefinition,
    Co2DailyAirQualityReportFunctionDefinition,
    Co2AirQualityAnomalyAlertFunctionDefinition,
    GpsMultiunitReportFunctionDefinition,
    GpsMultiunitGeofenceReportFunctionDefinition,
  ],
  outgoingDomains: [
    "api.soracom.io",
    "g.api.soracom.io",
    "files.slack.com",
    "files.sora-cam.soracom.io",
    "soracom-sora-cam-devices-api-export-file-prod.s3.amazonaws.com",
  ],
  botScopes: [
    "commands",
    "chat:write",
    "files:write",
    "channels:read",
    "groups:read",
    "users:read",
    "datastore:read",
    "datastore:write",
    "triggers:write",
  ],
});
