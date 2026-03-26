import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

/**
 * SoraCam 全台画像エクスポートジョブ用データストア
 *
 * チャンネル単位で進行中の全台エクスポート状態を保持します。
 */
const SoracomAllSoraCamImageExportJobsDatastore = DefineDatastore({
  name: "soracom_all_soracam_image_export_jobs",
  primary_key: "job_key",
  attributes: {
    job_key: {
      type: Schema.types.string,
      description: "ジョブ識別子（channel_id）",
    },
    channel_id: {
      type: Schema.slack.types.channel_id,
      description: "投稿先チャンネル",
    },
    message_ts: {
      type: Schema.types.string,
      description: "進捗メッセージの ts",
    },
    total_device_count: {
      type: Schema.types.number,
      description: "デバイス総数",
    },
    claim_id: {
      type: Schema.types.string,
      description: "初期化 claim ID",
    },
    status: {
      type: Schema.types.string,
      description: "ジョブ状態（starting/pending/completed）",
    },
    created_at: {
      type: Schema.types.string,
      description: "作成日時（ISO 8601）",
    },
    updated_at: {
      type: Schema.types.string,
      description: "更新日時（ISO 8601）",
    },
  },
});

export default SoracomAllSoraCamImageExportJobsDatastore;
