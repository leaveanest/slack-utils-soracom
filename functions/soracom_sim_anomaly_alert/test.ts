import { assertEquals } from "std/testing/asserts.ts";
import {
  detectSimAnomalies,
  filterAnomalousSims,
  formatAnomalyAlertMessage,
} from "./mod.ts";
import type { SoracomSim } from "../../lib/soracom/mod.ts";

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
  name: "異常ステータスのSIMが正しくフィルタされる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const sims: SoracomSim[] = [
      { ...baseSim, simId: "sim-1", status: "active" },
      { ...baseSim, simId: "sim-2", status: "suspended" },
      { ...baseSim, simId: "sim-3", status: "terminated" },
      { ...baseSim, simId: "sim-4", status: "active" },
      { ...baseSim, simId: "sim-5", status: "deactivated" },
    ];

    const anomalous = filterAnomalousSims(sims);
    assertEquals(anomalous.length, 3);
    assertEquals(anomalous[0].simId, "sim-2");
    assertEquals(anomalous[1].simId, "sim-3");
    assertEquals(anomalous[2].simId, "sim-5");
  },
});

Deno.test({
  name: "全SIMが正常な場合は空配列を返す",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const sims: SoracomSim[] = [
      { ...baseSim, simId: "sim-1", status: "active" },
      { ...baseSim, simId: "sim-2", status: "active" },
    ];

    const anomalous = filterAnomalousSims(sims);
    assertEquals(anomalous.length, 0);
  },
});

Deno.test({
  name: "異常SIMがある場合のアラートメッセージにwarningが含まれる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const anomalous: SoracomSim[] = [
      {
        ...baseSim,
        simId: "sim-2",
        status: "suspended",
        tags: { name: "Broken-Device" },
      },
    ];

    const message = formatAnomalyAlertMessage(anomalous, 5);
    assertEquals(message.includes("Broken-Device"), true);
    assertEquals(message.includes("suspended"), true);
    assertEquals(message.includes(":warning:"), true);
  },
});

Deno.test({
  name: "異常SIMがない場合は正常メッセージを返す",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatAnomalyAlertMessage([], 10);
    assertEquals(message.length > 0, true);
  },
});

Deno.test({
  name: "異常SIMのIMSIが空でもプレースホルダーを表示しない",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatAnomalyAlertMessage([
      { ...baseSim, imsi: "", status: "suspended" },
    ], 1);

    assertEquals(message.includes("{imsi}"), false);
    assertEquals(message.includes("IMSI: -"), true);
  },
});

Deno.test({
  name: "異常検知は全ページ取得後のSIMを対象にする",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const result = await detectSimAnomalies({
      listAllSims: () =>
        Promise.resolve([
          { ...baseSim, simId: "sim-1", status: "active" },
          { ...baseSim, simId: "sim-2", status: "suspended" },
          { ...baseSim, simId: "sim-3", status: "terminated" },
        ]),
    });

    assertEquals(result.totalCount, 3);
    assertEquals(
      result.anomalousSims.map((sim) => sim.simId),
      ["sim-2", "sim-3"],
    );
  },
});
