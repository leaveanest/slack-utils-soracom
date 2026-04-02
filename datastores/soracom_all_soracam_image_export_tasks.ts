import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

/**
 * SoraCam 全台画像エクスポートの各デバイスタスク用データストア
 */
const SoracomAllSoraCamImageExportTasksDatastore = DefineDatastore({
  name: "soracom_all_soracam_image_export_tasks",
  primary_key: "task_key",
  attributes: {
    task_key: {
      type: Schema.types.string,
      description: "タスク識別子（job_key:device_id）",
    },
    job_key: {
      type: Schema.types.string,
      description: "親ジョブ識別子",
    },
    channel_id: {
      type: Schema.slack.types.channel_id,
      description: "投稿先チャンネル",
    },
    device_id: {
      type: Schema.types.string,
      description: "対象デバイス ID",
    },
    device_name: {
      type: Schema.types.string,
      description: "対象デバイス名",
    },
    sort_index: {
      type: Schema.types.number,
      description: "表示順",
    },
    claim_id: {
      type: Schema.types.string,
      description: "実行 claim ID",
    },
    continuation_trigger_id: {
      type: Schema.types.string,
      description: "次回自動継続実行用 trigger ID",
    },
    export_id: {
      type: Schema.types.string,
      description: "エクスポート ID",
    },
    status: {
      type: Schema.types.string,
      description: "タスク状態（queued/processing/uploaded/failed）",
    },
    image_url: {
      type: Schema.types.string,
      description: "エクスポート済み画像 URL",
    },
    snapshot_time: {
      type: Schema.types.number,
      description: "スナップショット取得時刻",
    },
    slack_file_id: {
      type: Schema.types.string,
      description: "アップロード済み Slack ファイル ID",
    },
    retry_count: {
      type: Schema.types.number,
      description: "再試行回数",
    },
    error_message: {
      type: Schema.types.string,
      description: "失敗詳細",
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

export default SoracomAllSoraCamImageExportTasksDatastore;
