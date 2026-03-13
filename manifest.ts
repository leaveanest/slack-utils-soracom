import { Manifest } from "deno-slack-sdk/mod.ts";
import { ExampleFunctionDefinition } from "./functions/example_function/mod.ts";
import { SoracomListSimsFunctionDefinition } from "./functions/soracom_list_sims/mod.ts";
import { SoracomGetSimFunctionDefinition } from "./functions/soracom_get_sim/mod.ts";
import { SoracomGetAirUsageFunctionDefinition } from "./functions/soracom_get_air_usage/mod.ts";
import { SoracomGetHarvestDataFunctionDefinition } from "./functions/soracom_get_harvest_data/mod.ts";
import { SoracomListSoraCamDevicesFunctionDefinition } from "./functions/soracom_list_soracam_devices/mod.ts";
import { SoracomGetSoraCamEventsFunctionDefinition } from "./functions/soracom_get_soracam_events/mod.ts";
import { SoracomExportSoraCamImageFunctionDefinition } from "./functions/soracom_export_soracam_image/mod.ts";
import ExampleWorkflow from "./workflows/example_workflow.ts";
import SoracomListSimsWorkflow from "./workflows/soracom_list_sims_workflow.ts";
import SoracomGetSimWorkflow from "./workflows/soracom_get_sim_workflow.ts";
import SoracomGetAirUsageWorkflow from "./workflows/soracom_get_air_usage_workflow.ts";
import SoracomGetHarvestDataWorkflow from "./workflows/soracom_get_harvest_data_workflow.ts";
import SoracomListSoraCamDevicesWorkflow from "./workflows/soracom_list_soracam_devices_workflow.ts";
import SoracomGetSoraCamEventsWorkflow from "./workflows/soracom_get_soracam_events_workflow.ts";
import SoracomExportSoraCamImageWorkflow from "./workflows/soracom_export_soracam_image_workflow.ts";

// Load from environment variables with fallback defaults
const APP_NAME = Deno.env.get("SLACK_APP_NAME") || "Slack Utils Template";
const APP_DESCRIPTION = Deno.env.get("SLACK_APP_DESCRIPTION") ||
  "A template for Slack workflow development";

export default Manifest({
  name: APP_NAME,
  description: APP_DESCRIPTION,
  icon: "assets/icon.png",
  workflows: [
    ExampleWorkflow,
    SoracomListSimsWorkflow,
    SoracomGetSimWorkflow,
    SoracomGetAirUsageWorkflow,
    SoracomGetHarvestDataWorkflow,
    SoracomListSoraCamDevicesWorkflow,
    SoracomGetSoraCamEventsWorkflow,
    SoracomExportSoraCamImageWorkflow,
  ],
  functions: [
    ExampleFunctionDefinition,
    SoracomListSimsFunctionDefinition,
    SoracomGetSimFunctionDefinition,
    SoracomGetAirUsageFunctionDefinition,
    SoracomGetHarvestDataFunctionDefinition,
    SoracomListSoraCamDevicesFunctionDefinition,
    SoracomGetSoraCamEventsFunctionDefinition,
    SoracomExportSoraCamImageFunctionDefinition,
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
  ],
});
