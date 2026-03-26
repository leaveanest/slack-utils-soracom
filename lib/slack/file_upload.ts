import { t } from "../i18n/mod.ts";

interface SlackApiResponse {
  ok: boolean;
  error?: string;
}

interface SlackGetUploadUrlResponse extends SlackApiResponse {
  upload_url?: string;
  file_id?: string;
}

interface SlackCompleteUploadResponse extends SlackApiResponse {
  files?: Array<{
    id: string;
    title?: string;
  }>;
}

/**
 * Slack Web API の最小クライアント型です。
 */
export interface SlackApiClient {
  apiCall: (
    method: string,
    body?: Record<string, unknown>,
  ) => Promise<unknown>;
}

/**
 * Slack へファイルをアップロードする際の設定です。
 */
export interface SlackFileUploadOptions {
  /** アップロードするファイル名 */
  filename: string;
  /** Slack 上の表示タイトル */
  title: string;
  /** MIME type */
  contentType?: string;
  /** 代替テキスト */
  altText?: string;
  /** スレッド返信先 TS */
  threadTs?: string;
}

/**
 * バイナリデータを Slack の指定チャンネルへアップロードします。
 *
 * @param client - Slack Web API クライアント
 * @param channelId - 投稿先チャンネル ID
 * @param bytes - アップロードするファイル本体
 * @param options - ファイル名や MIME type などの設定
 * @returns Slack 上のファイル ID
 */
export async function uploadSlackFileToChannel(
  client: SlackApiClient,
  channelId: string,
  bytes: Uint8Array,
  options: SlackFileUploadOptions,
): Promise<string> {
  const uploadBody = Uint8Array.from(bytes).buffer;
  const uploadUrlResponse = await client.apiCall("files.getUploadURLExternal", {
    filename: options.filename,
    length: bytes.byteLength,
    alt_txt: options.altText ?? options.title,
  }) as SlackGetUploadUrlResponse;

  if (
    !uploadUrlResponse.ok || !uploadUrlResponse.upload_url ||
    !uploadUrlResponse.file_id
  ) {
    throw new Error(
      t("errors.api_call_failed", {
        error: uploadUrlResponse.error ?? "files.getUploadURLExternal_failed",
      }),
    );
  }

  const uploadResponse = await fetch(uploadUrlResponse.upload_url, {
    method: "POST",
    headers: {
      "Content-Type": options.contentType ?? "application/octet-stream",
    },
    body: new Blob([uploadBody], {
      type: options.contentType ?? "application/octet-stream",
    }),
  });

  if (!uploadResponse.ok) {
    throw new Error(
      t("errors.api_call_failed", {
        error: `slack_upload_http_${uploadResponse.status}`,
      }),
    );
  }

  const completeUploadRequest: Record<string, unknown> = {
    files: [{ id: uploadUrlResponse.file_id, title: options.title }],
    channel_id: channelId,
  };

  if (options.threadTs) {
    completeUploadRequest.thread_ts = options.threadTs;
  }

  const completeUploadResponse = await client.apiCall(
    "files.completeUploadExternal",
    completeUploadRequest,
  ) as SlackCompleteUploadResponse;

  if (!completeUploadResponse.ok) {
    throw new Error(
      t("errors.api_call_failed", {
        error: completeUploadResponse.error ??
          "files.completeUploadExternal_failed",
      }),
    );
  }

  const uploadedFileId = completeUploadResponse.files?.[0]?.id;
  if (!uploadedFileId) {
    throw new Error(t("errors.data_not_found"));
  }

  return uploadedFileId;
}
