import { assertEquals } from "std/testing/asserts.ts";
import type {
  GpsMultiunitBucketSummary,
  GpsMultiunitSample,
  SoracomSim,
} from "../../lib/soracom/mod.ts";
import { t } from "../../lib/i18n/mod.ts";
import {
  filterGpsMultiunitTargetSims,
  formatGpsMultiunitReportMessage,
  formatGpsMultiunitReportSummaryMessage,
  GpsMultiunitReportFunctionDefinition,
  maskGpsMultiunitImsiForDisplay,
  resolveGpsMultiunitSensorName,
} from "./mod.ts";

const baseSim: SoracomSim = {
  simId: "8942310022000012345",
  imsi: "440101234567890",
  msisdn: "09012345678",
  status: "active",
  speedClass: "s1.standard",
  tags: { name: "配送トラッカーA" },
  ipAddress: "10.0.0.1",
  createdAt: 1700000000000,
  lastModifiedAt: 1700000000000,
  groupId: "group-1",
  operatorId: "OP001",
  subscription: "plan-D",
  moduleType: "nano",
};

const latestSample: GpsMultiunitSample = {
  time: Date.parse("2026-03-20T00:00:00.000Z"),
  latitude: 35,
  longitude: 139,
  temperature: 18.5,
  humidity: 42.1,
  type: 0,
};

const bucketSummaries: GpsMultiunitBucketSummary[] = [
  {
    startTime: Date.parse("2026-03-20T00:00:00.000Z"),
    endTime: Date.parse("2026-03-20T00:20:00.000Z"),
    sampleCount: 2,
    averageTemperature: 20.5,
    averageHumidity: 41,
    latestSampleTime: Date.parse("2026-03-20T00:19:00.000Z"),
    latestLocation: {
      latitude: 35.01,
      longitude: 139.01,
      time: Date.parse("2026-03-20T00:19:00.000Z"),
    },
    hasDeviceError: true,
  },
  {
    startTime: Date.parse("2026-03-20T00:20:00.000Z"),
    endTime: Date.parse("2026-03-20T00:40:00.000Z"),
    sampleCount: 0,
    hasDeviceError: false,
  },
  {
    startTime: Date.parse("2026-03-20T00:40:00.000Z"),
    endTime: Date.parse("2026-03-20T01:00:00.000Z"),
    sampleCount: 1,
    averageTemperature: 22,
    averageHumidity: undefined,
    latestSampleTime: Date.parse("2026-03-20T00:50:00.000Z"),
    latestLocation: undefined,
    hasDeviceError: false,
  },
];

Deno.test({
  name: "最新1点レポートに温湿度と地図URLが含まれる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatGpsMultiunitReportMessage(
      "配送トラッカーA",
      "***********7890",
      "1h",
      1,
      latestSample,
      [],
    );

    assertEquals(message.includes("配送トラッカーA"), true);
    assertEquals(message.includes("***********7890"), true);
    assertEquals(message.includes("18.5"), true);
    assertEquals(message.includes("42.1"), true);
    assertEquals(message.includes("google.com/maps/search"), true);
    assertEquals(
      message.includes(t("soracom.messages.gps_multiunit_latest_section")),
      true,
    );
  },
});

Deno.test({
  name: "最新1点でGPSが取れない場合は警告文を出す",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatGpsMultiunitReportMessage(
      "配送トラッカーA",
      "***********7890",
      "1h",
      1,
      {
        ...latestSample,
        latitude: undefined,
        longitude: undefined,
        type: -1,
      },
      [],
    );

    assertEquals(
      message.includes(t("soracom.messages.gps_multiunit_location_missing")),
      true,
    );
    assertEquals(
      message.includes(
        t("soracom.messages.gps_multiunit_device_issue_warning"),
      ),
      true,
    );
  },
});

Deno.test({
  name: "平均化レポートは要求件数ぶんの時間枠を表示する",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatGpsMultiunitReportMessage(
      "配送トラッカーA",
      "***********7890",
      "1h",
      3,
      null,
      bucketSummaries,
    );

    assertEquals(
      message.includes(t("soracom.messages.gps_multiunit_bucket_section")),
      true,
    );
    assertEquals(
      message.includes(t("soracom.messages.gps_multiunit_bucket_no_data")),
      true,
    );
    assertEquals(message.includes("20.5"), true);
    assertEquals(message.includes("41"), true);
    assertEquals(
      message.includes(
        t("soracom.messages.gps_multiunit_device_issue_warning"),
      ),
      true,
    );
    assertEquals(
      message.includes(t("soracom.messages.gps_multiunit_location_missing")),
      true,
    );
  },
});

Deno.test({
  name: "SIMグループ内のactive SIMのみを対象にする",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const sims = filterGpsMultiunitTargetSims(
      [
        { ...baseSim, simId: "sim-1", status: "active", groupId: "group-1" },
        { ...baseSim, simId: "sim-2", status: "inactive", groupId: "group-1" },
        { ...baseSim, simId: "sim-3", status: "active", groupId: "group-2" },
      ],
      "group-1",
    );

    assertEquals(sims.map((sim) => sim.simId), ["sim-1"]);
  },
});

Deno.test({
  name: "表示名とIMSIマスクを既定ルールで解決する",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    assertEquals(resolveGpsMultiunitSensorName(baseSim), "配送トラッカーA");
    assertEquals(
      maskGpsMultiunitImsiForDisplay("440101234567890"),
      "***********7890",
    );
  },
});

Deno.test({
  name: "サマリーメッセージに件数と表示サンプル数が含まれる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatGpsMultiunitReportSummaryMessage(
      "group-1",
      "1d",
      3,
      5,
      4,
      1,
      0,
    );

    assertEquals(message.includes("group-1"), true);
    assertEquals(message.includes("3"), true);
    assertEquals(message.includes("対象 5台"), true);
    assertEquals(message.includes("投稿成功 4台"), true);
    assertEquals(message.includes("データなし 1台"), true);
  },
});

Deno.test({
  name: "GPSマルチユニットレポートは期間選択とサンプル数入力を持つ",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const definition = GpsMultiunitReportFunctionDefinition.definition as {
      input_parameters?: {
        properties?: {
          period?: {
            enum?: string[];
            default?: string;
          };
          sample_count?: {
            default?: number;
          };
        };
        required?: string[];
      };
      output_parameters?: {
        properties?: {
          failed_count?: {
            title?: string;
          };
          message?: {
            title?: string;
          };
          reported_count?: {
            title?: string;
          };
        };
        required?: string[];
      };
    };

    assertEquals(
      definition.input_parameters?.required,
      ["sim_group_id", "channel_id", "period"],
    );
    assertEquals(
      definition.input_parameters?.properties?.period?.enum,
      ["1h", "1d"],
    );
    assertEquals(
      definition.input_parameters?.properties?.period?.default,
      "1h",
    );
    assertEquals(
      definition.input_parameters?.properties?.sample_count?.default,
      1,
    );
    assertEquals(
      definition.output_parameters?.required?.includes("no_data_count"),
      true,
    );
    assertEquals(
      definition.output_parameters?.properties?.failed_count?.title,
      "取得失敗件数",
    );
    assertEquals(
      definition.output_parameters?.properties?.reported_count?.title,
      "投稿レポート数",
    );
    assertEquals(
      definition.output_parameters?.properties?.message?.title,
      "実行サマリー",
    );
  },
});
