import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { t } from "../../lib/i18n/mod.ts";
import {
  createSoracomClientFromEnv,
  formatBytes,
} from "../../lib/soracom/mod.ts";
import type { AirStatsResult, SoracomSim } from "../../lib/soracom/mod.ts";
import { statsPeriodSchema } from "../../lib/validation/schemas.ts";

const STATS_PERIOD_OPTIONS = ["day", "month"] as const;
type StatsPeriod = typeof STATS_PERIOD_OPTIONS[number];

interface SimUsageReportSoracomClient {
  listAllSims: (pageSize?: number) => Promise<SoracomSim[]>;
  getAirUsageOfSim: (
    simId: string,
    period: StatsPeriod,
    from: number,
    to: number,
  ) => Promise<AirStatsResult>;
}

/**
 * SIMの通信量サマリー情報
 */
export interface SimUsageSummary {
  /** SIM名またはID */
  name: string;
  /** IMSI */
  imsi: string;
  /** SIMステータス */
  status: string;
  /** アップロード合計バイト数 */
  totalUpload: number;
  /** ダウンロード合計バイト数 */
  totalDownload: number;
}

/**
 * SIM通信量サマリーレポート関数定義
 *
 * 全SIMの通信量統計を取得し、サマリーレポートとしてSlackチャンネルに投稿します。
 */
export const SoracomSimUsageReportFunctionDefinition = DefineFunction({
  callback_id: "soracom_sim_usage_report",
  title: "SIM通信量レポート",
  description: "全 SIM の通信量レポートを生成して共有します",
  source_file: "functions/soracom_sim_usage_report/mod.ts",
  input_parameters: {
    properties: {
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "レポートを投稿するチャンネル",
      },
      period: {
        type: Schema.types.string,
        description: "集計期間（day または month）",
        enum: STATS_PERIOD_OPTIONS,
      },
    },
    required: ["channel_id", "period"],
  },
  output_parameters: {
    properties: {
      sim_count: {
        type: Schema.types.number,
        description: "レポート対象の SIM 数",
      },
      total_upload: {
        type: Schema.types.string,
        description: "全 SIM の総アップロード量（整形済み）",
      },
      total_download: {
        type: Schema.types.string,
        description: "全 SIM の総ダウンロード量（整形済み）",
      },
      message: {
        type: Schema.types.string,
        description: "整形済みのレポートメッセージ",
      },
    },
    required: ["sim_count", "total_upload", "total_download", "message"],
  },
});

/**
 * SIMと通信量統計からサマリー情報を生成します
 *
 * @param sim - SIM情報
 * @param stats - 通信量統計
 * @returns サマリー情報
 */
export function buildSimUsageSummary(
  sim: SoracomSim,
  stats: AirStatsResult,
): SimUsageSummary {
  let totalUpload = 0;
  let totalDownload = 0;

  for (const dp of stats.dataPoints) {
    totalUpload += dp.uploadByteSizeTotal;
    totalDownload += dp.downloadByteSizeTotal;
  }

  return {
    name: sim.tags?.name || sim.simId,
    imsi: sim.imsi || sim.simId,
    status: sim.status,
    totalUpload,
    totalDownload,
  };
}

/**
 * SIM通信量レポートメッセージを生成します
 *
 * @param summaries - サマリー情報一覧
 * @param period - レポート期間
 * @returns フォーマットされたSlackメッセージ
 */
export function formatUsageReportMessage(
  summaries: SimUsageSummary[],
  period: string,
  options: {
    totalSimCount?: number;
    activeSimCount?: number;
  } = {},
): string {
  if (summaries.length === 0) {
    if ((options.totalSimCount ?? 0) === 0) {
      return t("soracom.messages.no_sims_found");
    }

    if ((options.activeSimCount ?? 0) === 0) {
      return t("soracom.messages.no_active_sims_found", {
        count: options.totalSimCount ?? 0,
      });
    }

    return t("soracom.messages.sim_usage_report_stats_unavailable", {
      count: options.activeSimCount ?? 0,
    });
  }

  let grandTotalUpload = 0;
  let grandTotalDownload = 0;

  const header = t("soracom.messages.sim_usage_report_header", {
    count: summaries.length,
    period,
  });

  const simLines = summaries.map((s) => {
    grandTotalUpload += s.totalUpload;
    grandTotalDownload += s.totalDownload;

    const upload = formatBytes(s.totalUpload);
    const download = formatBytes(s.totalDownload);

    return `  *${s.name}* (${s.status})\n    ${
      t("soracom.messages.air_usage_upload", { bytes: upload })
    } / ${t("soracom.messages.air_usage_download", { bytes: download })}`;
  });

  const grandTotal = t("soracom.messages.sim_usage_report_total", {
    upload: formatBytes(grandTotalUpload),
    download: formatBytes(grandTotalDownload),
  });

  return `*${header}*\n\n${simLines.join("\n\n")}\n\n*${grandTotal}*`;
}

/**
 * 全 SIM を走査して、active な SIM の通信量サマリーを収集します。
 *
 * @param soracomClient - SORACOM API クライアント
 * @param period - 集計期間
 * @param now - 集計終了時刻（UNIX 秒）
 * @returns レポート用の集計結果
 */
export async function collectSimUsageReportData(
  soracomClient: SimUsageReportSoracomClient,
  period: StatsPeriod,
  now = Math.floor(Date.now() / 1000),
): Promise<{
  summaries: SimUsageSummary[];
  totalSimCount: number;
  activeSimCount: number;
}> {
  const allSims = await soracomClient.listAllSims();
  const activeSims = allSims.filter((sim) => sim.status === "active");
  const from = period === "month"
    ? now - 30 * 24 * 60 * 60
    : now - 24 * 60 * 60;

  const summaries: SimUsageSummary[] = [];

  for (const sim of activeSims) {
    try {
      const stats = await soracomClient.getAirUsageOfSim(
        sim.simId,
        period,
        from,
        now,
      );
      summaries.push(buildSimUsageSummary(sim, stats));
    } catch (error) {
      // 個別SIMの取得失敗はスキップしてレポートを続行
      console.warn(
        `Failed to get usage for ${sim.simId}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return {
    summaries,
    totalSimCount: allSims.length,
    activeSimCount: activeSims.length,
  };
}

export default SlackFunction(
  SoracomSimUsageReportFunctionDefinition,
  async ({ inputs, client, env }) => {
    try {
      const period = statsPeriodSchema.parse(inputs.period) as StatsPeriod;

      console.log(
        t("soracom.logs.generating_usage_report", { period }),
      );

      const soracomClient = createSoracomClientFromEnv(env);
      const { summaries, totalSimCount, activeSimCount } =
        await collectSimUsageReportData(soracomClient, period);

      const message = formatUsageReportMessage(summaries, period, {
        totalSimCount,
        activeSimCount,
      });

      let grandTotalUpload = 0;
      let grandTotalDownload = 0;
      for (const s of summaries) {
        grandTotalUpload += s.totalUpload;
        grandTotalDownload += s.totalDownload;
      }

      await client.chat.postMessage({
        channel: inputs.channel_id,
        text: message,
      });

      return {
        outputs: {
          sim_count: summaries.length,
          total_upload: formatBytes(grandTotalUpload),
          total_download: formatBytes(grandTotalDownload),
          message,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("soracom_sim_usage_report error:", errorMessage);
      return { error: errorMessage };
    }
  },
);
