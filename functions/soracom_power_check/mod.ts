import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { formatLocalizedDateTime, t } from "../../lib/i18n/mod.ts";
import type {
  PowerMetricKind,
  PowerSample,
  SoracomSim,
} from "../../lib/soracom/mod.ts";
import {
  createSoracomClientFromEnv,
  resolveLatestPowerSample,
} from "../../lib/soracom/mod.ts";
import {
  channelIdSchema,
  imsiSchema,
  nonEmptyStringSchema,
} from "../../lib/validation/schemas.ts";

const POWER_CHECK_LOOKBACK_MS = 24 * 60 * 60 * 1000;

type PowerCheckSimResult =
  | { sim: SoracomSim; status: "ok"; sample: PowerSample }
  | { sim: SoracomSim; status: "no_data" | "invalid_data" | "failed" };

/**
 * 電力チェック関数定義
 *
 * 指定した SIM グループ配下の active SIM から、`tag.name` の部分一致で対象を絞り、
 * 最新の電力系メトリクスを Slack に投稿します。
 */
export const SoracomPowerCheckFunctionDefinition = DefineFunction({
  callback_id: "soracom_power_check",
  title: "SORACOM 電力チェック",
  description:
    "SIM グループ内の対象 SIM について、最新の電力系メトリクスを確認します",
  source_file: "functions/soracom_power_check/mod.ts",
  input_parameters: {
    properties: {
      sim_group_id: {
        type: Schema.types.string,
        title: "SIMグループID",
        description: "対象の SIM グループ ID",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        title: "投稿先チャンネル",
        description: "結果を投稿するチャンネル",
      },
      tag_name: {
        type: Schema.types.string,
        title: "tag.name フィルター",
        description: "対象 SIM を `tag.name` の部分一致で絞り込みます",
      },
    },
    required: ["sim_group_id", "channel_id", "tag_name"],
  },
  output_parameters: {
    properties: {
      processed_count: {
        type: Schema.types.number,
        description: "処理した SIM 数",
      },
      reported_count: {
        type: Schema.types.number,
        description: "最新値を取得できた SIM 数",
      },
      no_data_count: {
        type: Schema.types.number,
        description: "データなしの SIM 数",
      },
      invalid_count: {
        type: Schema.types.number,
        description: "壊れたデータの SIM 数",
      },
      failed_count: {
        type: Schema.types.number,
        description: "取得失敗した SIM 数",
      },
      message: {
        type: Schema.types.string,
        description: "投稿したメッセージ本文",
      },
    },
    required: [
      "processed_count",
      "reported_count",
      "no_data_count",
      "invalid_count",
      "failed_count",
      "message",
    ],
  },
});

/**
 * 指定グループ内の active SIM を `tag.name` の部分一致で抽出します。
 *
 * @param sims - SIM一覧
 * @param simGroupId - 対象グループ ID
 * @param tagNameFilter - `tag.name` の部分一致フィルター
 * @returns 対象SIM一覧
 */
export function filterPowerCheckTargetSims(
  sims: SoracomSim[],
  simGroupId: string,
  tagNameFilter: string,
): SoracomSim[] {
  const normalizedFilter = tagNameFilter.trim().toLocaleLowerCase();

  return sims.filter((sim) => {
    if (sim.groupId !== simGroupId || sim.status !== "active") {
      return false;
    }

    const tagName = sim.tags.name?.trim();
    if (!tagName || normalizedFilter.length === 0) {
      return false;
    }

    return tagName.toLocaleLowerCase().includes(normalizedFilter);
  });
}

/**
 * 表示用の IMSI をマスクします。
 *
 * @param imsi - IMSI
 * @returns マスク済み IMSI
 */
export function maskPowerCheckImsiForDisplay(imsi: string): string {
  if (imsi.length <= 4) {
    return imsi;
  }

  return `${"*".repeat(imsi.length - 4)}${imsi.slice(-4)}`;
}

/**
 * SIM の表示名を解決します。
 *
 * IMSI 側の `name` を優先し、未設定ならマスク済み IMSI、最後に SIM ID を使います。
 *
 * @param sim - 対象 SIM
 * @returns 表示名
 */
export function resolvePowerCheckDisplayName(sim: SoracomSim): string {
  const configuredName = sim.name?.trim();
  if (configuredName && configuredName.length > 0) {
    return configuredName;
  }

  if (sim.imsi.length > 0) {
    return maskPowerCheckImsiForDisplay(sim.imsi);
  }

  return sim.simId;
}

/**
 * 電力チェックの Slack メッセージを生成します。
 *
 * @param simGroupId - SIMグループ ID
 * @param tagName - フィルター文字列
 * @param results - SIMごとの結果
 * @returns フォーマット済みメッセージ
 */
export function formatPowerCheckMessage(
  simGroupId: string,
  tagName: string,
  results: PowerCheckSimResult[],
): string {
  const reportedCount = results.filter((result) => result.status === "ok")
    .length;
  const noDataCount = results.filter((result) => result.status === "no_data")
    .length;
  const invalidCount =
    results.filter((result) => result.status === "invalid_data").length;
  const failedCount = results.filter((result) => result.status === "failed")
    .length;

  const sortedResults = [...results].sort((left, right) =>
    resolvePowerCheckDisplayName(left.sim).localeCompare(
      resolvePowerCheckDisplayName(right.sim),
      "ja",
    )
  );

  const detailLines = sortedResults.map((result) => {
    const displayName = resolvePowerCheckDisplayName(result.sim);
    const detail = formatPowerCheckResultDetail(result);
    return t("soracom.messages.power_check_detail_item", {
      displayName,
      detail,
    });
  });

  return [
    `*${
      t("soracom.messages.power_check_header", {
        groupId: simGroupId,
        tagName,
      })
    }*`,
    `*${t("soracom.messages.power_check_section_summary")}*`,
    t("soracom.messages.power_check_summary_targets", {
      count: results.length,
    }),
    t("soracom.messages.power_check_summary_reported", {
      count: reportedCount,
    }),
    t("soracom.messages.power_check_summary_no_data", {
      count: noDataCount,
    }),
    t("soracom.messages.power_check_summary_invalid", {
      count: invalidCount,
    }),
    t("soracom.messages.power_check_summary_failed", {
      count: failedCount,
    }),
    `*${t("soracom.messages.power_check_section_details")}*`,
    ...detailLines,
  ].join("\n");
}

function formatPowerCheckResultDetail(result: PowerCheckSimResult): string {
  switch (result.status) {
    case "ok":
      return t("soracom.messages.power_check_status_ok", {
        metric: formatPowerMetricLabel(result.sample.kind),
        value: formatPowerValue(result.sample.value, result.sample.kind),
        unit: result.sample.unit,
        time: formatLocalizedDateTime(result.sample.time),
      });
    case "no_data":
      return t("soracom.messages.power_check_status_no_data");
    case "invalid_data":
      return t("soracom.messages.power_check_status_invalid");
    case "failed":
      return t("soracom.messages.power_check_status_failed");
  }
}

function formatPowerMetricLabel(kind: PowerMetricKind): string {
  switch (kind) {
    case "power":
      return t("soracom.messages.power_check_metric_power");
    case "voltage":
      return t("soracom.messages.power_check_metric_voltage");
    case "current":
      return t("soracom.messages.power_check_metric_current");
    case "battery":
      return t("soracom.messages.power_check_metric_battery");
  }
}

function formatPowerValue(value: number, kind: PowerMetricKind): string {
  if (kind === "battery") {
    return value.toFixed(0);
  }

  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
}

export default SlackFunction(
  SoracomPowerCheckFunctionDefinition,
  async ({ inputs, client, env }) => {
    try {
      const simGroupId = nonEmptyStringSchema.parse(
        typeof inputs.sim_group_id === "string"
          ? inputs.sim_group_id.trim()
          : "",
      );
      const channelId = channelIdSchema.parse(
        typeof inputs.channel_id === "string" ? inputs.channel_id : "",
      );
      const tagName = nonEmptyStringSchema.parse(
        typeof inputs.tag_name === "string" ? inputs.tag_name.trim() : "",
      );

      const soracomClient = createSoracomClientFromEnv(env);
      const allSims = await soracomClient.listAllSims();
      const simsInGroup = allSims.filter((sim) => sim.groupId === simGroupId);

      if (simsInGroup.length === 0) {
        throw new Error(
          t("soracom.errors.sim_group_sims_not_found", {
            groupId: simGroupId,
          }),
        );
      }

      const activeSims = simsInGroup.filter((sim) => sim.status === "active");
      if (activeSims.length === 0) {
        throw new Error(
          t("soracom.errors.sim_group_active_sims_not_found", {
            groupId: simGroupId,
            count: simsInGroup.length,
          }),
        );
      }

      const targetSims = filterPowerCheckTargetSims(
        simsInGroup,
        simGroupId,
        tagName,
      );
      if (targetSims.length === 0) {
        throw new Error(
          t("soracom.errors.power_check_target_sims_not_found", {
            groupId: simGroupId,
            tagName,
            count: activeSims.length,
          }),
        );
      }

      const now = Date.now();
      const lookbackStart = now - POWER_CHECK_LOOKBACK_MS;
      const results: PowerCheckSimResult[] = [];

      for (const sim of targetSims) {
        try {
          const imsi = imsiSchema.parse(sim.imsi);

          console.log(t("soracom.logs.fetching_power_data", { imsi }));

          const harvestData = await soracomClient.getHarvestData(
            imsi,
            lookbackStart,
            now,
          );
          const resolution = resolveLatestPowerSample(harvestData.entries);

          switch (resolution.status) {
            case "ok":
              results.push({
                sim,
                status: "ok",
                sample: resolution.sample,
              });
              break;
            case "no_data":
              results.push({ sim, status: "no_data" });
              break;
            case "invalid_data":
              results.push({ sim, status: "invalid_data" });
              break;
          }
        } catch (error) {
          const errorMessage = error instanceof Error
            ? error.message
            : String(error);
          console.error(
            `soracom_power_check sim error (${sim.imsi || sim.simId}):`,
            errorMessage,
          );
          results.push({ sim, status: "failed" });
        }
      }

      const failedCount = results.filter((result) => result.status === "failed")
        .length;
      if (failedCount === targetSims.length) {
        throw new Error(t("soracom.errors.power_check_all_failed"));
      }

      const message = formatPowerCheckMessage(simGroupId, tagName, results);

      await client.chat.postMessage({
        channel: channelId,
        text: message,
      });

      return {
        outputs: {
          processed_count: targetSims.length,
          reported_count: results.filter((result) => result.status === "ok")
            .length,
          no_data_count: results.filter((result) => result.status === "no_data")
            .length,
          invalid_count: results.filter((result) =>
            result.status === "invalid_data"
          ).length,
          failed_count: failedCount,
          message,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("soracom_power_check error:", errorMessage);
      return { error: errorMessage };
    }
  },
);
