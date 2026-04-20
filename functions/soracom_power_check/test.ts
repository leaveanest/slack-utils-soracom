import { assertEquals } from "std/testing/asserts.ts";
import type { SoracomSim } from "../../lib/soracom/mod.ts";
import { t } from "../../lib/i18n/mod.ts";
import {
  filterPowerCheckTargetSims,
  formatPowerCheckMessage,
  maskPowerCheckImsiForDisplay,
  resolvePowerCheckDisplayName,
  SoracomPowerCheckFunctionDefinition,
} from "./mod.ts";

const baseSim: SoracomSim = {
  simId: "8942310022000012345",
  name: "分電盤A",
  imsi: "440101234567890",
  msisdn: "09012345678",
  status: "active",
  speedClass: "s1.standard",
  tags: { name: "拠点A-電源監視" },
  ipAddress: "10.0.0.1",
  createdAt: 1700000000000,
  lastModifiedAt: 1700000000000,
  groupId: "group-1",
  operatorId: "OP001",
  subscription: "plan-D",
  moduleType: "nano",
};

Deno.test({
  name: "tag.name の部分一致で active SIM を抽出する",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const sims = filterPowerCheckTargetSims(
      [
        { ...baseSim, simId: "sim-1", tags: { name: "拠点A-電源監視" } },
        { ...baseSim, simId: "sim-2", tags: { name: "拠点B-電源監視" } },
        { ...baseSim, simId: "sim-3", status: "inactive" },
        { ...baseSim, simId: "sim-4", groupId: "group-2" },
      ],
      "group-1",
      "電源",
    );

    assertEquals(sims.map((sim) => sim.simId), ["sim-1", "sim-2"]);
  },
});

Deno.test({
  name: "tag.name の部分一致は大文字小文字差を吸収する",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const sims = filterPowerCheckTargetSims(
      [
        { ...baseSim, simId: "sim-1", tags: { name: "Power-Sensor-A" } },
      ],
      "group-1",
      "sensor",
    );

    assertEquals(sims.map((sim) => sim.simId), ["sim-1"]);
  },
});

Deno.test({
  name: "表示名は IMSI 側の name を優先し、無ければマスク済み IMSI を使う",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    assertEquals(resolvePowerCheckDisplayName(baseSim), "分電盤A");
    assertEquals(
      resolvePowerCheckDisplayName({
        ...baseSim,
        name: "",
      }),
      "***********7890",
    );
    assertEquals(
      maskPowerCheckImsiForDisplay("440101234567890"),
      "***********7890",
    );
  },
});

Deno.test({
  name: "電力チェックメッセージは件数と各SIMの状態を含む",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatPowerCheckMessage("group-1", "電源", [
      {
        sim: baseSim,
        status: "ok",
        sample: {
          time: Date.parse("2026-03-20T00:00:00.000Z"),
          kind: "voltage",
          key: "voltage",
          value: 12.4,
          unit: "V",
        },
      },
      {
        sim: { ...baseSim, simId: "sim-2", name: "分電盤B" },
        status: "no_data",
      },
      {
        sim: { ...baseSim, simId: "sim-3", name: "分電盤C" },
        status: "invalid_data",
      },
      {
        sim: { ...baseSim, simId: "sim-4", name: "分電盤D" },
        status: "failed",
      },
    ]);

    assertEquals(message.includes("group-1"), true);
    assertEquals(message.includes("電源"), true);
    assertEquals(
      message.includes(t("soracom.messages.power_check_summary_targets", {
        count: 4,
      })),
      true,
    );
    assertEquals(message.includes("分電盤A"), true);
    assertEquals(message.includes("12.40 V"), true);
    assertEquals(
      message.includes(t("soracom.messages.power_check_status_no_data")),
      true,
    );
    assertEquals(
      message.includes(t("soracom.messages.power_check_status_invalid")),
      true,
    );
    assertEquals(
      message.includes(t("soracom.messages.power_check_status_failed")),
      true,
    );
  },
});

Deno.test({
  name: "電力チェック関数はグループと tag.name フィルター入力を持つ",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const definition = SoracomPowerCheckFunctionDefinition.definition as {
      input_parameters?: {
        required?: string[];
      };
      output_parameters?: {
        properties?: {
          invalid_count?: {
            description?: string;
          };
        };
      };
    };

    assertEquals(definition.input_parameters?.required, [
      "sim_group_id",
      "channel_id",
      "tag_name",
    ]);
    assertEquals(
      definition.output_parameters?.properties?.invalid_count?.description,
      "壊れたデータの SIM 数",
    );
  },
});
