import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

/**
 * SoraCam 動体検知画像確認ジョブ用データストア
 *
 * チャンネル + デバイス単位で進行中の画像アップロード状態を保持します。
 */
const SoracomMotionCaptureJobsDatastore = DefineDatastore({
  name: "soracom_motion_capture_jobs",
  primary_key: "job_key",
  attributes: {
    job_key: {
      type: Schema.types.string,
      description: "ジョブ識別子（channel_id:device_id）",
    },
    channel_id: {
      type: Schema.slack.types.channel_id,
      description: "親メッセージを投稿したチャンネル",
    },
    device_id: {
      type: Schema.types.string,
      description: "対象 SoraCam デバイス ID",
    },
    thread_ts: {
      type: Schema.types.string,
      description: "親メッセージの thread_ts",
    },
    window_start_ms: {
      type: Schema.types.number,
      description: "固定参照ウィンドウ開始時刻（ms）",
    },
    window_end_ms: {
      type: Schema.types.number,
      description: "固定参照ウィンドウ終了時刻（ms）",
    },
    event_times_json: {
      type: Schema.types.string,
      description: "降順イベント時刻配列(JSON)",
    },
    next_index: {
      type: Schema.types.number,
      description: "次に処理するイベント index",
    },
    total_event_count: {
      type: Schema.types.number,
      description: "イベント総件数",
    },
    uploaded_count: {
      type: Schema.types.number,
      description: "アップロード済み件数",
    },
    failed_count: {
      type: Schema.types.number,
      description: "失敗件数",
    },
    claim_id: {
      type: Schema.types.string,
      description: "初期化 claim ID",
    },
    continuation_trigger_id: {
      type: Schema.types.string,
      description: "次回自動継続実行用 trigger ID",
    },
    status: {
      type: Schema.types.string,
      description: "ジョブ状態（pending/completed）",
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

export default SoracomMotionCaptureJobsDatastore;
