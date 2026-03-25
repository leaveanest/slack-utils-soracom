import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { formatLocalizedDateTime, t } from "../../lib/i18n/mod.ts";
import type {
  GpsMultiunitBucketSummary,
  GpsMultiunitLocation,
  GpsMultiunitSample,
  SoracomSim,
} from "../../lib/soracom/mod.ts";
import {
  bucketGpsMultiunitSamples,
  buildGpsMultiunitGoogleMapsUrl,
  createSoracomClientFromEnv,
  extractGpsMultiunitSamples,
  findLatestGpsMultiunitSample,
  hasGpsMultiunitLocation,
  isGpsMultiunitDeviceIssue,
} from "../../lib/soracom/mod.ts";
import {
  channelIdSchema,
  gpsMultiunitPeriodSchema,
  gpsMultiunitSampleCountSchema,
  imsiSchema,
  nonEmptyStringSchema,
} from "../../lib/validation/schemas.ts";

const GPS_MULTIUNIT_REPORT_PERIOD_OPTIONS = ["1h", "1d"] as const;
type GpsMultiunitReportPeriod =
  typeof GPS_MULTIUNIT_REPORT_PERIOD_OPTIONS[number];
const GPS_MULTIUNIT_REPORT_PERIOD_CHOICES = [
  { value: "1h", title: "1時間", description: "直近1時間を集計" },
  { value: "1d", title: "1日", description: "直近1日を集計" },
] as const;

interface GpsMultiunitReportChatClient {
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

type GpsMultiunitReportInputs = {
  sim_group_id: string;
  channel_id: string;
  period: string;
  sample_count: number;
};

/**
 * GPSマルチユニットレポート関数定義
 *
 * 指定した SIM グループ配下の active SIM を走査し、
 * GPS マルチユニットの最新点または時間別平均を Slack に投稿します。
 */
export const GpsMultiunitReportFunctionDefinition = DefineFunction({
  callback_id: "gps_multiunit_report",
  title: "GPSマルチユニットレポート",
  description:
    "指定した SIM グループの GPS マルチユニットの温湿度と位置情報を集計します",
  source_file: "functions/gps_multiunit_report/mod.ts",
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
        description: "レポート投稿先チャンネル",
      },
      period: {
        type: Schema.types.string,
        title: "集計期間",
        description: "集計期間を選択してください（既定値: 1時間）",
        enum: GPS_MULTIUNIT_REPORT_PERIOD_OPTIONS,
        choices: GPS_MULTIUNIT_REPORT_PERIOD_CHOICES,
        default: "1h",
      },
      sample_count: {
        type: Schema.types.number,
        title: "表示サンプル数",
        description: "1 は最新 1 点、2 以上は期間を等分した平均（既定値: 1）",
        default: 1,
      },
    },
    required: ["sim_group_id", "channel_id", "period"],
  },
  output_parameters: {
    properties: {
      processed_count: {
        type: Schema.types.number,
        title: "処理対象SIM数",
        description: "処理した SIM 数",
      },
      reported_count: {
        type: Schema.types.number,
        title: "投稿レポート数",
        description: "投稿したレポート数",
      },
      no_data_count: {
        type: Schema.types.number,
        title: "データなしSIM数",
        description: "サンプルが見つからなかった SIM 数",
      },
      failed_count: {
        type: Schema.types.number,
        title: "取得失敗件数",
        description: "取得または投稿に失敗した件数",
      },
      message: {
        type: Schema.types.string,
        title: "実行サマリー",
        description: "実行サマリー",
      },
    },
    required: [
      "processed_count",
      "reported_count",
      "no_data_count",
      "failed_count",
      "message",
    ],
  },
});

/**
 * 指定グループ内の active SIM を対象として抽出します。
 *
 * @param sims - 候補となる SIM 一覧
 * @param simGroupId - 対象グループ ID
 * @returns レポート対象の SIM 一覧
 */
export function filterGpsMultiunitTargetSims(
  sims: SoracomSim[],
  simGroupId: string,
): SoracomSim[] {
  return sims.filter((sim) =>
    sim.groupId === simGroupId && sim.status === "active"
  );
}

/**
 * SIM から表示名を解決します。
 *
 * `tags.name` を優先し、未設定なら IMSI、最後に SIM ID を使います。
 *
 * @param sim - 対象 SIM
 * @returns 表示名
 */
export function resolveGpsMultiunitSensorName(sim: SoracomSim): string {
  const taggedName = sim.tags.name?.trim();

  if (taggedName && taggedName.length > 0) {
    return taggedName;
  }

  if (sim.imsi.length > 0) {
    return sim.imsi;
  }

  return sim.simId;
}

export function maskGpsMultiunitImsiForDisplay(imsi: string): string {
  if (imsi.length <= 4) {
    return imsi;
  }

  return `${"*".repeat(imsi.length - 4)}${imsi.slice(-4)}`;
}

/**
 * GPSマルチユニットレポートの Slack メッセージを生成します。
 *
 * @param sensorName - センサー表示名
 * @param imsi - 表示用 IMSI
 * @param period - 集計期間
 * @param sampleCount - 表示サンプル数
 * @param latestSample - 最新サンプル
 * @param bucketSummaries - バケット集計
 * @returns フォーマット済みメッセージ
 */
export function formatGpsMultiunitReportMessage(
  sensorName: string,
  imsi: string,
  period: GpsMultiunitReportPeriod,
  sampleCount: number,
  latestSample: GpsMultiunitSample | null,
  bucketSummaries: GpsMultiunitBucketSummary[],
): string {
  const periodLabel = formatGpsMultiunitReportPeriodLabel(period);
  const header = t("soracom.messages.gps_multiunit_report_header", {
    sensorName,
    imsi,
    period: periodLabel,
  });

  if (sampleCount === 1) {
    if (latestSample === null) {
      return [
        header,
        t("soracom.messages.gps_multiunit_report_no_data", {
          period: periodLabel,
        }),
      ].join("\n\n");
    }

    return [
      header,
      `*${t("soracom.messages.gps_multiunit_latest_section")}*`,
      toBulletLines([
        t("soracom.messages.gps_multiunit_sample_time", {
          time: formatLocalizedDateTime(latestSample.time),
        }),
        formatMetricLine(
          t("soracom.messages.gps_multiunit_temperature_label"),
          latestSample.temperature,
        ),
        formatMetricLine(
          t("soracom.messages.gps_multiunit_humidity_label"),
          latestSample.humidity,
        ),
        formatLocationLine(
          latestSample.latitude,
          latestSample.longitude,
        ),
        ...formatDeviceIssueLines(isGpsMultiunitDeviceIssue(latestSample)),
      ]).join("\n"),
    ].join("\n\n");
  }

  const allBucketsEmpty = bucketSummaries.every((bucket) =>
    bucket.sampleCount === 0
  );
  const sections = [
    header,
    allBucketsEmpty
      ? t("soracom.messages.gps_multiunit_report_no_data", {
        period: periodLabel,
      })
      : null,
    [
      `*${t("soracom.messages.gps_multiunit_bucket_section")}*`,
      bucketSummaries.map((bucket) => formatBucketSummary(bucket)).join("\n\n"),
    ].join("\n"),
  ].filter((section): section is string => section !== null);

  return sections.join("\n\n");
}

export function formatGpsMultiunitReportSummaryMessage(
  simGroupId: string,
  period: GpsMultiunitReportPeriod,
  sampleCount: number,
  processedCount: number,
  reportedCount: number,
  noDataCount: number,
  failedCount: number,
): string {
  return [
    t("soracom.messages.gps_multiunit_report_summary_header", {
      groupId: simGroupId,
      period: formatGpsMultiunitReportPeriodLabel(period),
      sampleCount,
    }),
    t("soracom.messages.gps_multiunit_report_summary", {
      processed: processedCount,
      reported: reportedCount,
      noData: noDataCount,
      failed: failedCount,
    }),
  ].join("\n");
}

function formatMetricLine(label: string, value?: number): string {
  return t("soracom.messages.gps_multiunit_metric_line", {
    label,
    value: value === undefined
      ? t("soracom.messages.gps_multiunit_metric_unavailable")
      : formatMetricNumber(value),
  });
}

function formatLocationLine(
  latitude?: number,
  longitude?: number,
): string {
  if (latitude === undefined || longitude === undefined) {
    return t("soracom.messages.gps_multiunit_location_missing");
  }

  return t("soracom.messages.gps_multiunit_location_available", {
    url: buildGpsMultiunitGoogleMapsUrl(latitude, longitude),
    label: t("soracom.messages.gps_multiunit_google_maps"),
    latitude: formatCoordinate(latitude),
    longitude: formatCoordinate(longitude),
  });
}

function formatDeviceIssueLines(hasDeviceIssue: boolean): string[] {
  return hasDeviceIssue
    ? [t("soracom.messages.gps_multiunit_device_issue_warning")]
    : [];
}

function formatBucketSummary(bucket: GpsMultiunitBucketSummary): string {
  const lines = [
    t("soracom.messages.gps_multiunit_bucket_window", {
      start: formatLocalizedDateTime(bucket.startTime),
      end: formatLocalizedDateTime(bucket.endTime),
    }),
    t("soracom.messages.gps_multiunit_bucket_sample_count", {
      count: bucket.sampleCount,
    }),
  ];

  if (bucket.sampleCount === 0) {
    lines.push(t("soracom.messages.gps_multiunit_bucket_no_data"));
    return toBucketBlock(lines);
  }

  lines.push(
    formatMetricLine(
      t("soracom.messages.gps_multiunit_average_temperature_label"),
      bucket.averageTemperature,
    ),
  );
  lines.push(
    formatMetricLine(
      t("soracom.messages.gps_multiunit_average_humidity_label"),
      bucket.averageHumidity,
    ),
  );
  lines.push(
    bucket.latestLocation
      ? formatLocationLineFromLocation(bucket.latestLocation)
      : t("soracom.messages.gps_multiunit_location_missing"),
  );
  lines.push(...formatDeviceIssueLines(bucket.hasDeviceError));

  return toBucketBlock(lines);
}

function formatLocationLineFromLocation(
  location: GpsMultiunitLocation,
): string {
  return formatLocationLine(location.latitude, location.longitude);
}

function toBucketBlock(lines: string[]): string {
  const [firstLine, ...rest] = lines;
  return [firstLine, ...rest.map((line) => `  - ${line}`)].join("\n");
}

function toBulletLines(lines: string[]): string[] {
  return lines.map((line) => `- ${line}`);
}

function formatMetricNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(1);
}

function formatCoordinate(value: number): string {
  return value.toFixed(6);
}

function formatGpsMultiunitReportPeriodLabel(
  period: GpsMultiunitReportPeriod,
): string {
  switch (period) {
    case "1h":
      return t("soracom.messages.air_quality_report_period_1h");
    case "1d":
      return t("soracom.messages.air_quality_report_period_1d");
  }
}

function resolveGpsMultiunitReportLookbackMs(
  period: GpsMultiunitReportPeriod,
): number {
  switch (period) {
    case "1h":
      return 60 * 60 * 1000;
    case "1d":
      return 24 * 60 * 60 * 1000;
  }
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
  client: GpsMultiunitReportChatClient,
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
  client: GpsMultiunitReportChatClient,
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

export default SlackFunction(
  GpsMultiunitReportFunctionDefinition,
  async ({ inputs, client, env }) => {
    try {
      const {
        sim_group_id: simGroupIdRaw,
        channel_id: channelIdRaw,
        period: periodRaw,
        sample_count: sampleCountRaw,
      } = inputs as GpsMultiunitReportInputs;

      const simGroupId = nonEmptyStringSchema.parse(
        typeof simGroupIdRaw === "string" ? simGroupIdRaw.trim() : "",
      );
      const channelId = channelIdSchema.parse(channelIdRaw);
      const period = gpsMultiunitPeriodSchema.parse(
        periodRaw,
      ) as GpsMultiunitReportPeriod;
      const sampleCount = gpsMultiunitSampleCountSchema.parse(
        sampleCountRaw ?? 1,
      );

      console.log(
        t("soracom.logs.loading_sims_for_group", {
          groupId: simGroupId,
        }),
      );

      const now = Date.now();
      const lookbackStart = now - resolveGpsMultiunitReportLookbackMs(period);
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

      const targetSims = filterGpsMultiunitTargetSims(simsInGroup, simGroupId);
      if (targetSims.length === 0) {
        throw new Error(
          t("soracom.errors.sim_group_active_sims_not_found", {
            groupId: simGroupId,
            count: simsInGroup.length,
          }),
        );
      }

      const generatedReports: string[] = [];
      let noDataCount = 0;
      let failedCount = 0;

      for (const sim of targetSims) {
        try {
          const imsi = imsiSchema.parse(sim.imsi);

          console.log(
            t("soracom.logs.generating_gps_multiunit_report", {
              imsi,
              period: formatGpsMultiunitReportPeriodLabel(period),
              sampleCount,
            }),
          );

          const result = await soracomClient.getHarvestData(
            imsi,
            lookbackStart,
            now,
          );
          const samples = extractGpsMultiunitSamples(result.entries);
          const latestSample = findLatestGpsMultiunitSample(samples);
          const bucketSummaries = sampleCount > 1
            ? bucketGpsMultiunitSamples(
              samples,
              lookbackStart,
              now,
              sampleCount,
            )
            : [];

          const hasNoData = sampleCount === 1
            ? latestSample === null
            : bucketSummaries.every((bucket) => bucket.sampleCount === 0);

          if (hasNoData) {
            noDataCount += 1;
          }

          generatedReports.push(
            formatGpsMultiunitReportMessage(
              resolveGpsMultiunitSensorName(sim),
              maskGpsMultiunitImsiForDisplay(imsi),
              period,
              sampleCount,
              latestSample,
              bucketSummaries,
            ),
          );
        } catch (error) {
          failedCount += 1;
          const errorMessage = error instanceof Error
            ? error.message
            : String(error);
          console.error(
            `gps_multiunit_report sim error (${sim.imsi || sim.simId}):`,
            errorMessage,
          );
        }
      }

      if (generatedReports.length === 0) {
        throw new Error(t("soracom.errors.gps_multiunit_reports_all_failed"));
      }

      const chatClient = client as unknown as GpsMultiunitReportChatClient;
      const initialSummaryMessage = formatGpsMultiunitReportSummaryMessage(
        simGroupId,
        period,
        sampleCount,
        targetSims.length,
        0,
        noDataCount,
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
            "gps_multiunit_report channel post error:",
            errorMessage,
          );
        }
      }

      if (reportedCount === 0) {
        throw new Error(t("soracom.errors.gps_multiunit_reports_all_failed"));
      }

      const message = formatGpsMultiunitReportSummaryMessage(
        simGroupId,
        period,
        sampleCount,
        targetSims.length,
        reportedCount,
        noDataCount,
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
          "gps_multiunit_report summary update error:",
          errorMessage,
        );
      }

      return {
        outputs: {
          processed_count: targetSims.length,
          reported_count: reportedCount,
          no_data_count: noDataCount,
          failed_count: failedCount,
          message,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("gps_multiunit_report error:", errorMessage);
      return { error: errorMessage };
    }
  },
);
