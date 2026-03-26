import { assertEquals } from "std/testing/asserts.ts";
import {
  buildSimUsageSummary,
  collectSimUsageReportData,
  formatUsageReportMessage,
  SoracomSimUsageReportFunctionDefinition,
} from "./mod.ts";
import { t } from "../../lib/i18n/mod.ts";
import type { AirStatsResult, SoracomSim } from "../../lib/soracom/mod.ts";
import type { SimUsageSummary } from "./mod.ts";

const baseSim: SoracomSim = {
  simId: "8942310022000012345",
  imsi: "440101234567890",
  msisdn: "09012345678",
  status: "active",
  speedClass: "s1.standard",
  tags: { name: "Device-01" },
  ipAddress: "10.0.0.1",
  createdAt: 1700000000000,
  lastModifiedAt: 1700000000000,
  groupId: "group-1",
  operatorId: "OP001",
  subscription: "plan-D",
  moduleType: "nano",
};

Deno.test({
  name: "SIM通信量サマリーが正しく生成される",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats: AirStatsResult = {
      imsi: "440101234567890",
      period: "day",
      dataPoints: [
        {
          date: 1700000000000,
          uploadByteSizeTotal: 1048576,
          downloadByteSizeTotal: 2097152,
          uploadPacketSizeTotal: 100,
          downloadPacketSizeTotal: 200,
        },
        {
          date: 1700086400000,
          uploadByteSizeTotal: 524288,
          downloadByteSizeTotal: 1048576,
          uploadPacketSizeTotal: 50,
          downloadPacketSizeTotal: 100,
        },
      ],
    };

    const summary = buildSimUsageSummary(baseSim, stats);
    assertEquals(summary.name, "Device-01");
    assertEquals(summary.imsi, "440101234567890");
    assertEquals(summary.totalUpload, 1572864);
    assertEquals(summary.totalDownload, 3145728);
  },
});

Deno.test({
  name: "データポイントが空のSIMは通信量0になる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats: AirStatsResult = {
      imsi: "440101234567890",
      period: "day",
      dataPoints: [],
    };

    const summary = buildSimUsageSummary(baseSim, stats);
    assertEquals(summary.totalUpload, 0);
    assertEquals(summary.totalDownload, 0);
  },
});

Deno.test({
  name: "レポートメッセージが正しくフォーマットされる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const summaries: SimUsageSummary[] = [
      {
        name: "Device-01",
        imsi: "440101234567890",
        status: "active",
        totalUpload: 1048576,
        totalDownload: 2097152,
      },
      {
        name: "Device-02",
        imsi: "440109876543210",
        status: "active",
        totalUpload: 524288,
        totalDownload: 1048576,
      },
    ];

    const message = formatUsageReportMessage(summaries, "day");
    assertEquals(message.includes("Device-01"), true);
    assertEquals(message.includes("Device-02"), true);
  },
});

Deno.test({
  name: "SIMがない場合は適切なメッセージを返す",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatUsageReportMessage([], "day");
    assertEquals(message, t("soracom.messages.no_sims_found"));
  },
});

Deno.test({
  name: "activeなSIMがない場合は専用メッセージを返す",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatUsageReportMessage([], "day", {
      totalSimCount: 3,
      activeSimCount: 0,
    });
    assertEquals(
      message,
      t("soracom.messages.no_active_sims_found", { count: 3 }),
    );
  },
});

Deno.test({
  name: "activeなSIMの統計が全件取得失敗した場合は専用メッセージを返す",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatUsageReportMessage([], "day", {
      totalSimCount: 3,
      activeSimCount: 2,
    });
    assertEquals(
      message,
      t("soracom.messages.sim_usage_report_stats_unavailable", { count: 2 }),
    );
  },
});

Deno.test({
  name: "全ページ取得後のactiveなSIMだけ通信量を集計する",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const usageCalls: string[] = [];
    const result = await collectSimUsageReportData(
      {
        listAllSims: () =>
          Promise.resolve([
            { ...baseSim, simId: "sim-1", status: "active" },
            { ...baseSim, simId: "sim-2", status: "inactive" },
            { ...baseSim, simId: "sim-3", status: "active" },
          ]),
        getAirUsageOfSim: (simId) => {
          usageCalls.push(simId);
          return Promise.resolve({
            imsi: `${simId}-imsi`,
            period: "day",
            dataPoints: [
              {
                date: 1700000000000,
                uploadByteSizeTotal: 1,
                downloadByteSizeTotal: 2,
                uploadPacketSizeTotal: 3,
                downloadPacketSizeTotal: 4,
              },
            ],
          });
        },
      },
      "day",
      1700000000,
    );

    assertEquals(result.totalSimCount, 3);
    assertEquals(result.activeSimCount, 2);
    assertEquals(result.summaries.length, 2);
    assertEquals(usageCalls, ["sim-1", "sim-3"]);
  },
});

Deno.test({
  name: "期間入力はセレクタ向けの列挙値を持つ",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const definition = SoracomSimUsageReportFunctionDefinition.definition as {
      input_parameters?: {
        properties?: {
          period?: {
            enum?: string[];
          };
        };
      };
    };

    assertEquals(
      definition.input_parameters?.properties?.period?.enum,
      ["day", "month"],
    );
  },
});
