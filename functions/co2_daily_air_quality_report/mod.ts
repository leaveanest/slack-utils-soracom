import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { formatLocalizedDateTime, t } from "../../lib/i18n/mod.ts";
import type {
  AirQualityBucketSummary,
  AirQualityCriteria,
  AirQualityMetricSummary,
  AirQualitySummary,
  SoracomSim,
} from "../../lib/soracom/mod.ts";
import {
  bucketAirQualityEntries,
  createSoracomClientFromEnv,
  findPeakCo2Bucket,
  resolveAirQualityCriteria,
  summarizeAirQualityEntries,
} from "../../lib/soracom/mod.ts";
import {
  channelIdSchema,
  imsiSchema,
  nonEmptyStringSchema,
} from "../../lib/validation/schemas.ts";

type AirQualityCriteriaView = {
  co2Max: number;
  temperatureMin: number;
  temperatureMax: number;
  humidityMin: number;
  humidityMax: number;
  co2ViolationCount: number;
  temperatureViolationCount: number;
  humidityViolationCount: number;
};

const DEFAULT_BUCKET_MINUTES = 60;

interface Co2DailyAirQualityReportChatClient {
  chat: {
    postMessage: (params: {
      channel: string;
      text: string;
      blocks?: Array<Record<string, unknown>>;
    }) => Promise<{
      ok: boolean;
      error?: string;
      ts?: string;
      message?: { ts?: string };
    }>;
    update: (params: {
      channel: string;
      ts: string;
      text: string;
      blocks?: Array<Record<string, unknown>>;
    }) => Promise<{
      ok: boolean;
      error?: string;
    }>;
  };
}

/**
 * 日次空気品質レポート関数定義
 *
 * 指定した SIM グループ配下の active SIM を走査し、
 * CO2 / 温度 / 湿度の要約と CO2 ピーク時間帯を Slack に投稿します。
 */
export const Co2DailyAirQualityReportFunctionDefinition = DefineFunction({
  callback_id: "co2_daily_air_quality_report",
  title: "日次空気品質レポート",
  description:
    "指定した SIM グループの日次空気品質サマリーとCO2ピーク時間帯を生成します",
  source_file: "functions/co2_daily_air_quality_report/mod.ts",
  input_parameters: {
    properties: {
      sim_group_id: {
        type: Schema.types.string,
        description: "対象の SIM グループ ID",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "レポート投稿先チャンネル",
      },
      co2_threshold: {
        type: Schema.types.number,
        description: "CO2 しきい値（ppm）",
      },
      temperature_min: {
        type: Schema.types.number,
        description: "温度下限しきい値（C）",
      },
      temperature_max: {
        type: Schema.types.number,
        description: "温度上限しきい値（C）",
      },
      humidity_min: {
        type: Schema.types.number,
        description: "湿度下限しきい値（%）",
      },
      humidity_max: {
        type: Schema.types.number,
        description: "湿度上限しきい値（%）",
      },
    },
    required: ["sim_group_id", "channel_id"],
  },
  output_parameters: {
    properties: {
      processed_count: {
        type: Schema.types.number,
        description: "処理した SIM 数",
      },
      reported_count: {
        type: Schema.types.number,
        description: "投稿したレポート数",
      },
      failed_count: {
        type: Schema.types.number,
        description: "失敗したレポート数",
      },
      message: {
        type: Schema.types.string,
        description: "実行サマリー",
      },
    },
    required: ["processed_count", "reported_count", "failed_count", "message"],
  },
});

/**
 * 日次空気品質レポートの Slack メッセージを生成します。
 *
 * @param sensorName - センサー表示名
 * @param imsi - IMSI
 * @param summary - 集計済み空気品質サマリー
 * @param peakBucket - CO2 ピーク時間帯
 * @returns フォーマット済みメッセージ
 */
export function formatCo2DailyAirQualityReportMessage(
  sensorName: string,
  imsi: string,
  summary: AirQualitySummary,
  peakBucket: AirQualityBucketSummary | null,
): string {
  const criteria = getAirQualityCriteriaView(summary);
  const header = `${
    t("soracom.messages.co2_daily_air_quality_report_header", {
      sensorName,
      imsi,
    })
  }`;

  if (summary.sampleCount === 0) {
    return [header, t("soracom.messages.co2_daily_air_quality_report_no_data")]
      .join("\n\n");
  }

  const sections = [
    header,
    [
      `*${t("soracom.messages.air_quality_report_section_summary")}*`,
      ...toBulletLines([
        t("soracom.messages.air_quality_sample_count", {
          count: summary.sampleCount,
        }),
        ...formatCriteriaViolationLines(criteria),
      ]),
    ].join("\n"),
    [
      `*${t("soracom.messages.air_quality_report_section_peak")}*`,
      ...toBulletLines(formatPeakBucketLines(peakBucket)),
    ].join("\n"),
    [
      `*${t("soracom.messages.air_quality_report_section_metrics")}*`,
      ...toBulletLines([
        formatMetricSummaryBlock(
          t("soracom.messages.air_quality_metric_co2"),
          summary.co2,
        ),
        formatMetricSummaryBlock(
          t("soracom.messages.air_quality_metric_temperature"),
          summary.temperature,
        ),
        formatMetricSummaryBlock(
          t("soracom.messages.air_quality_metric_humidity"),
          summary.humidity,
        ),
      ]),
    ].join("\n"),
  ].filter((section) => section.length > 0);

  return sections.join("\n\n");
}

export function maskImsiForDisplay(imsi: string): string {
  if (imsi.length <= 4) {
    return imsi;
  }

  return `${"*".repeat(imsi.length - 4)}${imsi.slice(-4)}`;
}

/**
 * 1つのメトリクス要約を表示用の複数行ブロックに変換します。
 *
 * @param label - 表示名
 * @param summary - メトリクス要約
 * @returns フォーマット済み文字列
 */
function formatMetricSummaryBlock(
  label: string,
  summary: AirQualityMetricSummary,
): string {
  if (
    summary.latest === undefined ||
    summary.average === undefined ||
    summary.min === undefined ||
    summary.max === undefined
  ) {
    return [
      label,
      `  - ${t("soracom.messages.air_quality_metric_unavailable_short")}`,
    ].join("\n");
  }

  return [
    label,
    `  - ${
      t("soracom.messages.air_quality_metric_latest", {
        value: formatMetricNumber(summary.latest),
      })
    }`,
    `  - ${
      t("soracom.messages.air_quality_metric_average", {
        value: formatMetricNumber(summary.average),
      })
    }`,
    `  - ${
      t("soracom.messages.air_quality_metric_min", {
        value: formatMetricNumber(summary.min),
      })
    }`,
    `  - ${
      t("soracom.messages.air_quality_metric_max", {
        value: formatMetricNumber(summary.max),
      })
    }`,
  ].join("\n");
}

/**
 * 数値を表示向けに丸めて文字列化します。
 *
 * @param value - 表示対象の数値
 * @returns 文字列化された数値
 */
function formatMetricNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(1);
}

function formatCriteriaViolationLines(
  criteria: AirQualityCriteriaView,
): [string, string, string] {
  return [
    t("soracom.messages.air_quality_co2_violation_count", {
      threshold: formatMetricNumber(criteria.co2Max),
      count: criteria.co2ViolationCount,
    }),
    t("soracom.messages.air_quality_temperature_violation_count", {
      min: formatMetricNumber(criteria.temperatureMin),
      max: formatMetricNumber(criteria.temperatureMax),
      count: criteria.temperatureViolationCount,
    }),
    t("soracom.messages.air_quality_humidity_violation_count", {
      min: formatMetricNumber(criteria.humidityMin),
      max: formatMetricNumber(criteria.humidityMax),
      count: criteria.humidityViolationCount,
    }),
  ];
}

function formatPeakBucketLines(
  peakBucket: AirQualityBucketSummary | null,
): string[] {
  if (peakBucket === null) {
    return [];
  }

  return [
    t("soracom.messages.air_quality_peak_window", {
      start: formatLocalizedDateTime(peakBucket.startTime),
      end: formatLocalizedDateTime(peakBucket.endTime),
    }),
    peakBucket.summary.co2.average !== undefined
      ? t("soracom.messages.air_quality_peak_co2", {
        value: formatMetricNumber(peakBucket.summary.co2.average),
      })
      : t("soracom.messages.air_quality_peak_co2_missing"),
  ];
}

function toBulletLines(lines: string[]): string[] {
  return lines.map((line) => `- ${line}`);
}

function getAirQualityCriteriaView(
  summary: AirQualitySummary,
): AirQualityCriteriaView {
  return {
    co2Max: summary.criteria.co2Max,
    temperatureMin: summary.criteria.temperatureMin,
    temperatureMax: summary.criteria.temperatureMax,
    humidityMin: summary.criteria.humidityMin,
    humidityMax: summary.criteria.humidityMax,
    co2ViolationCount: summary.co2ThresholdExceededCount,
    temperatureViolationCount: summary.temperatureOutOfRangeCount,
    humidityViolationCount: summary.humidityOutOfRangeCount,
  };
}

type Co2DailyAirQualityReportCriteriaInputs = {
  co2_threshold?: number;
  temperature_min?: number;
  temperature_max?: number;
  humidity_min?: number;
  humidity_max?: number;
};

type Co2DailyAirQualityReportInputs =
  & Co2DailyAirQualityReportCriteriaInputs
  & {
    sim_group_id: string;
    channel_id: string;
  };

/**
 * ワークフロー入力から日次空気品質レポート用の基準値を解決します。
 *
 * @param inputs - レポート入力のしきい値
 * @returns 解決済みの空気品質基準
 * @throws {Error} 入力値が不正な場合
 */
export function resolveCo2DailyAirQualityReportCriteria(
  inputs: Co2DailyAirQualityReportCriteriaInputs,
): AirQualityCriteria {
  try {
    return resolveAirQualityCriteria({
      co2Max: inputs.co2_threshold,
      temperatureMin: inputs.temperature_min,
      temperatureMax: inputs.temperature_max,
      humidityMin: inputs.humidity_min,
      humidityMax: inputs.humidity_max,
    });
  } catch {
    throw new Error(t("errors.invalid_input"));
  }
}

/**
 * 指定グループ内の active SIM をレポート対象として抽出します。
 *
 * @param sims - 候補となる SIM 一覧
 * @param simGroupId - 対象グループ ID
 * @returns レポート対象の SIM 一覧
 */
export function filterCo2DailyAirQualityReportSims(
  sims: SoracomSim[],
  simGroupId: string,
): SoracomSim[] {
  return sims.filter((sim) =>
    sim.groupId === simGroupId && sim.status === "active"
  );
}

/**
 * SIM からレポート表示用のセンサー名を解決します。
 *
 * `tags.name` を優先し、未設定なら IMSI、最後に SIM ID を使います。
 *
 * @param sim - 対象 SIM
 * @returns 表示用のセンサー名
 */
export function resolveCo2DailyAirQualitySensorName(sim: SoracomSim): string {
  const taggedName = sim.tags.name?.trim();

  if (taggedName && taggedName.length > 0) {
    return taggedName;
  }

  if (sim.imsi.length > 0) {
    return sim.imsi;
  }

  return sim.simId;
}

export function formatCo2DailyAirQualityReportSummaryMessage(
  simGroupId: string,
  processedCount: number,
  reportedCount: number,
  failedCount: number,
): string {
  return [
    `${
      t("soracom.messages.co2_daily_air_quality_report_summary_header", {
        groupId: simGroupId,
      })
    }`,
    formatExecutionSummary(processedCount, reportedCount, failedCount),
  ].join("\n");
}

function buildMarkdownBlocks(text: string): Array<Record<string, unknown>> {
  return text
    .split(/\n{2,}/)
    .filter((section) => section.trim().length > 0)
    .map((section) => ({
      type: "section",
      text: {
        type: "mrkdwn",
        text: section,
      },
    }));
}

function getPostedMessageTs(response: {
  ts?: string;
  message?: { ts?: string };
}): string | undefined {
  return response.ts ?? response.message?.ts;
}

async function postMarkdownMessage(
  client: Co2DailyAirQualityReportChatClient,
  channel: string,
  text: string,
): Promise<string | undefined> {
  const response = await client.chat.postMessage({
    channel,
    text,
    blocks: buildMarkdownBlocks(text),
  });

  if (!response.ok) {
    throw new Error(
      t("errors.api_call_failed", {
        error: response.error ?? "chat.postMessage_failed",
      }),
    );
  }

  return getPostedMessageTs(response);
}

async function updateMarkdownMessage(
  client: Co2DailyAirQualityReportChatClient,
  channel: string,
  ts: string,
  text: string,
): Promise<void> {
  const response = await client.chat.update({
    channel,
    ts,
    text,
    blocks: buildMarkdownBlocks(text),
  });

  if (!response.ok) {
    throw new Error(
      t("errors.api_call_failed", {
        error: response.error ?? "chat.update_failed",
      }),
    );
  }
}

function formatExecutionSummary(
  processedCount: number,
  reportedCount: number,
  failedCount: number,
): string {
  return t("soracom.messages.sim_batch_summary", {
    processed: processedCount,
    reported: reportedCount,
    failed: failedCount,
  });
}

export default SlackFunction(
  Co2DailyAirQualityReportFunctionDefinition,
  async ({ inputs, client, env }) => {
    try {
      const {
        sim_group_id: simGroupIdRaw,
        channel_id: channelIdRaw,
      } = inputs as Co2DailyAirQualityReportInputs;
      const simGroupId = nonEmptyStringSchema.parse(
        typeof simGroupIdRaw === "string" ? simGroupIdRaw.trim() : "",
      );
      const channelId = channelIdSchema.parse(channelIdRaw);
      const criteria = resolveCo2DailyAirQualityReportCriteria(inputs);

      console.log(
        t("soracom.logs.loading_sims_for_group", {
          groupId: simGroupId,
        }),
      );

      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
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

      const targetSims = filterCo2DailyAirQualityReportSims(
        simsInGroup,
        simGroupId,
      );
      if (targetSims.length === 0) {
        throw new Error(
          t("soracom.errors.sim_group_active_sims_not_found", {
            groupId: simGroupId,
            count: simsInGroup.length,
          }),
        );
      }

      const generatedReports: string[] = [];
      let failedCount = 0;

      for (const sim of targetSims) {
        try {
          const imsi = imsiSchema.parse(sim.imsi);

          console.log(
            t("soracom.logs.generating_co2_daily_air_quality_report", {
              imsi,
            }),
          );

          const result = await soracomClient.getHarvestData(
            imsi,
            oneDayAgo,
            now,
          );

          const summary = summarizeAirQualityEntries(result.entries, criteria);
          const peakBucket = findPeakCo2Bucket(
            bucketAirQualityEntries(
              result.entries,
              DEFAULT_BUCKET_MINUTES * 60 * 1000,
              criteria,
            ),
          );
          const message = formatCo2DailyAirQualityReportMessage(
            resolveCo2DailyAirQualitySensorName(sim),
            maskImsiForDisplay(imsi),
            summary,
            peakBucket,
          );

          generatedReports.push(message);
        } catch (error) {
          failedCount += 1;
          const errorMessage = error instanceof Error
            ? error.message
            : String(error);
          console.error(
            `co2_daily_air_quality_report sim error (${
              sim.imsi || sim.simId
            }):`,
            errorMessage,
          );
        }
      }

      if (generatedReports.length === 0) {
        throw new Error(t("soracom.errors.daily_reports_all_failed"));
      }

      const chatClient =
        client as unknown as Co2DailyAirQualityReportChatClient;
      const initialSummaryMessage =
        formatCo2DailyAirQualityReportSummaryMessage(
          simGroupId,
          targetSims.length,
          0,
          failedCount,
        );
      const summaryMessageTs = await postMarkdownMessage(
        chatClient,
        channelId,
        initialSummaryMessage,
      );

      if (!summaryMessageTs) {
        throw new Error(t("errors.data_not_found"));
      }

      let reportedCount = 0;
      for (const report of generatedReports) {
        try {
          await postMarkdownMessage(chatClient, channelId, report);
          reportedCount += 1;
        } catch (error) {
          failedCount += 1;
          const errorMessage = error instanceof Error
            ? error.message
            : String(error);
          console.error(
            "co2_daily_air_quality_report channel post error:",
            errorMessage,
          );
        }
      }

      if (reportedCount === 0) {
        throw new Error(t("soracom.errors.daily_reports_all_failed"));
      }

      const message = formatCo2DailyAirQualityReportSummaryMessage(
        simGroupId,
        targetSims.length,
        reportedCount,
        failedCount,
      );

      try {
        await updateMarkdownMessage(
          chatClient,
          channelId,
          summaryMessageTs,
          message,
        );
      } catch (error) {
        const errorMessage = error instanceof Error
          ? error.message
          : String(error);
        console.error(
          "co2_daily_air_quality_report summary update error:",
          errorMessage,
        );
      }

      return {
        outputs: {
          processed_count: targetSims.length,
          reported_count: reportedCount,
          failed_count: failedCount,
          message,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("co2_daily_air_quality_report error:", errorMessage);
      return { error: errorMessage };
    }
  },
);
