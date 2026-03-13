/**
 * 共通バリデーションスキーマ
 * Zodを使用した型安全なバリデーション
 * i18n対応のエラーメッセージをサポート
 */
import { z } from "zod";
import { initI18n, t } from "../i18n/mod.ts";

// トップレベルawaitでi18nを初期化
await initI18n();

/**
 * i18n対応のSlackチャンネル ID スキーマを生成
 * 形式: C + 英数字大文字
 *
 * エラーメッセージは検証時に動的に評価されるため、
 * ロケール変更に対応します。
 *
 * @returns Zodスキーマ
 *
 * @example
 * ```typescript
 * const schema = createChannelIdSchema();
 * const channelId = schema.parse("C12345678");
 * ```
 */
export function createChannelIdSchema() {
  return z.string().superRefine((val, ctx) => {
    if (val.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_small,
        minimum: 1,
        type: "string",
        inclusive: true,
        message: t("errors.validation.channel_id_empty"),
      });
      return;
    }
    if (!/^C[A-Z0-9]+$/.test(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.invalid_string,
        validation: "regex",
        message: t("errors.validation.channel_id_format"),
      });
    }
  });
}

/**
 * i18n対応のSlack ユーザー ID スキーマを生成
 * 形式: U または W + 英数字大文字
 *
 * エラーメッセージは検証時に動的に評価されるため、
 * ロケール変更に対応します。
 *
 * @returns Zodスキーマ
 *
 * @example
 * ```typescript
 * const schema = createUserIdSchema();
 * const userId = schema.parse("U0812GLUZD2");
 * ```
 */
export function createUserIdSchema() {
  return z.string().superRefine((val, ctx) => {
    if (val.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_small,
        minimum: 1,
        type: "string",
        inclusive: true,
        message: t("errors.validation.user_id_empty"),
      });
      return;
    }
    if (!/^[UW][A-Z0-9]+$/.test(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.invalid_string,
        validation: "regex",
        message: t("errors.validation.user_id_format"),
      });
    }
  });
}

/**
 * i18n対応の空でない文字列スキーマを生成
 *
 * エラーメッセージは検証時に動的に評価されるため、
 * ロケール変更に対応します。
 *
 * @returns Zodスキーマ
 *
 * @example
 * ```typescript
 * const schema = createNonEmptyStringSchema();
 * const text = schema.parse("Hello");
 * ```
 */
export function createNonEmptyStringSchema() {
  return z.string().superRefine((val, ctx) => {
    if (val.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_small,
        minimum: 1,
        type: "string",
        inclusive: true,
        message: t("errors.validation.value_empty"),
      });
    }
  });
}

/**
 * Slackチャンネル ID スキーマ（デフォルトインスタンス）
 *
 * エラーメッセージは検証時に動的に評価されるため、
 * ロケール変更に自動的に対応します。
 *
 * @example
 * ```typescript
 * const channelId = channelIdSchema.parse("C12345678");
 * ```
 */
export const channelIdSchema = createChannelIdSchema();

/**
 * Slack ユーザー ID スキーマ（デフォルトインスタンス）
 *
 * エラーメッセージは検証時に動的に評価されるため、
 * ロケール変更に自動的に対応します。
 *
 * @example
 * ```typescript
 * const userId = userIdSchema.parse("U0812GLUZD2");
 * ```
 */
export const userIdSchema = createUserIdSchema();

/**
 * 空でない文字列スキーマ（デフォルトインスタンス）
 *
 * エラーメッセージは検証時に動的に評価されるため、
 * ロケール変更に自動的に対応します。
 *
 * @example
 * ```typescript
 * const text = nonEmptyStringSchema.parse("Hello");
 * ```
 */
export const nonEmptyStringSchema = createNonEmptyStringSchema();

/**
 * i18n対応のSoracom SIM IDスキーマを生成
 * 形式: 数字のみ（ICCID形式、18〜22桁）
 *
 * @returns Zodスキーマ
 *
 * @example
 * ```typescript
 * const schema = createSimIdSchema();
 * const simId = schema.parse("8942310022000012345");
 * ```
 */
export function createSimIdSchema() {
  return z.string().superRefine((val, ctx) => {
    if (val.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_small,
        minimum: 1,
        type: "string",
        inclusive: true,
        message: t("soracom.errors.validation.sim_id_empty"),
      });
      return;
    }
    if (!/^\d{18,22}$/.test(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.invalid_string,
        validation: "regex",
        message: t("soracom.errors.validation.sim_id_format"),
      });
    }
  });
}

/**
 * i18n対応のIMSIスキーマを生成
 * 形式: 数字のみ（15桁）
 *
 * @returns Zodスキーマ
 *
 * @example
 * ```typescript
 * const schema = createImsiSchema();
 * const imsi = schema.parse("440101234567890");
 * ```
 */
export function createImsiSchema() {
  return z.string().superRefine((val, ctx) => {
    if (val.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_small,
        minimum: 1,
        type: "string",
        inclusive: true,
        message: t("soracom.errors.validation.imsi_empty"),
      });
      return;
    }
    if (!/^\d{15}$/.test(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.invalid_string,
        validation: "regex",
        message: t("soracom.errors.validation.imsi_format"),
      });
    }
  });
}

/**
 * i18n対応のカバレッジタイプスキーマを生成
 * 値: "jp" または "g"
 *
 * @returns Zodスキーマ
 */
export function createCoverageTypeSchema() {
  return z.string().superRefine((val, ctx) => {
    if (val !== "jp" && val !== "g") {
      ctx.addIssue({
        code: z.ZodIssueCode.invalid_enum_value,
        options: ["jp", "g"],
        received: val,
        message: t("soracom.errors.validation.coverage_type_invalid"),
      });
    }
  });
}

/**
 * i18n対応の統計期間スキーマを生成
 * 値: "day" または "month"
 *
 * @returns Zodスキーマ
 */
export function createStatsPeriodSchema() {
  return z.string().superRefine((val, ctx) => {
    if (val !== "day" && val !== "month") {
      ctx.addIssue({
        code: z.ZodIssueCode.invalid_enum_value,
        options: ["day", "month"],
        received: val,
        message: t("soracom.errors.validation.stats_period_invalid"),
      });
    }
  });
}

/**
 * i18n対応のソラカメデバイスIDスキーマを生成
 * 形式: 英数字とハイフン
 *
 * @returns Zodスキーマ
 *
 * @example
 * ```typescript
 * const schema = createSoraCamDeviceIdSchema();
 * const deviceId = schema.parse("7CXXXXXXXXXX");
 * ```
 */
export function createSoraCamDeviceIdSchema() {
  return z.string().superRefine((val, ctx) => {
    if (val.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_small,
        minimum: 1,
        type: "string",
        inclusive: true,
        message: t("soracom.errors.validation.soracam_device_id_empty"),
      });
      return;
    }
    if (!/^[A-Za-z0-9-]+$/.test(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.invalid_string,
        validation: "regex",
        message: t("soracom.errors.validation.soracam_device_id_format"),
      });
    }
  });
}

/**
 * Soracom SIM ID スキーマ（デフォルトインスタンス）
 */
export const simIdSchema = createSimIdSchema();

/**
 * IMSI スキーマ（デフォルトインスタンス）
 */
export const imsiSchema = createImsiSchema();

/**
 * カバレッジタイプ スキーマ（デフォルトインスタンス）
 */
export const coverageTypeSchema = createCoverageTypeSchema();

/**
 * 統計期間 スキーマ（デフォルトインスタンス）
 */
export const statsPeriodSchema = createStatsPeriodSchema();

/**
 * ソラカメデバイスID スキーマ（デフォルトインスタンス）
 */
export const soraCamDeviceIdSchema = createSoraCamDeviceIdSchema();

/**
 * 型推論のエクスポート
 */
export type ChannelId = z.infer<ReturnType<typeof createChannelIdSchema>>;
export type UserId = z.infer<ReturnType<typeof createUserIdSchema>>;
export type NonEmptyString = z.infer<
  ReturnType<typeof createNonEmptyStringSchema>
>;
export type SimId = z.infer<ReturnType<typeof createSimIdSchema>>;
export type Imsi = z.infer<ReturnType<typeof createImsiSchema>>;
export type CoverageType = z.infer<ReturnType<typeof createCoverageTypeSchema>>;
export type StatsPeriod = z.infer<ReturnType<typeof createStatsPeriodSchema>>;
export type SoraCamDeviceId = z.infer<
  ReturnType<typeof createSoraCamDeviceIdSchema>
>;
