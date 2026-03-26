import { assertEquals } from "std/testing/asserts.ts";
import {
  getLocale,
  initI18n,
  loadLocale,
  setLocale,
  SUPPORTED_LOCALES,
} from "../i18n/mod.ts";
import {
  airQualityReportPeriodSchema,
  channelIdSchema,
  coverageTypeSchema,
  createChannelIdSchema,
  createGpsMultiunitPeriodSchema,
  createGpsMultiunitSampleCountSchema,
  createImsiSchema,
  createLatitudeSchema,
  createLongitudeSchema,
  createNonEmptyStringSchema,
  createRadiusMetersSchema,
  createSimIdSchema,
  createSoraCamDeviceIdSchema,
  createUserIdSchema,
  gpsMultiunitPeriodSchema,
  gpsMultiunitSampleCountSchema,
  imsiSchema,
  latitudeSchema,
  longitudeSchema,
  nonEmptyStringSchema,
  radiusMetersSchema,
  simIdSchema,
  soraCamDeviceIdSchema,
  statsPeriodSchema,
  userIdSchema,
} from "./schemas.ts";

// i18n初期化
await initI18n();

// テストで使用する全てのロケールを事前に読み込む
await loadLocale("en");
await loadLocale("ja");

const originalLocale = getLocale() as typeof SUPPORTED_LOCALES[number];

Deno.test("channelIdSchema: 正常なチャンネルIDを検証", () => {
  const result = channelIdSchema.safeParse("C12345678");
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data, "C12345678");
  }
});

Deno.test("channelIdSchema: 不正なチャンネルIDを拒否（小文字）", () => {
  const result = channelIdSchema.safeParse("c12345678");
  assertEquals(result.success, false);
});

Deno.test("channelIdSchema: 不正なチャンネルIDを拒否（Cで開始しない）", () => {
  const result = channelIdSchema.safeParse("U12345678");
  assertEquals(result.success, false);
});

Deno.test("channelIdSchema: 空文字を拒否", () => {
  const result = channelIdSchema.safeParse("");
  assertEquals(result.success, false);
});

Deno.test("userIdSchema: 正常なユーザーIDを検証（U開始）", () => {
  const result = userIdSchema.safeParse("U0812GLUZD2");
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data, "U0812GLUZD2");
  }
});

Deno.test("userIdSchema: 正常なユーザーIDを検証（W開始）", () => {
  const result = userIdSchema.safeParse("W1234567890");
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data, "W1234567890");
  }
});

Deno.test("userIdSchema: 不正なユーザーIDを拒否", () => {
  const result = userIdSchema.safeParse("invalid");
  assertEquals(result.success, false);
});

Deno.test("userIdSchema: 空文字を拒否", () => {
  const result = userIdSchema.safeParse("");
  assertEquals(result.success, false);
});

Deno.test("nonEmptyStringSchema: 正常な文字列を検証", () => {
  const result = nonEmptyStringSchema.safeParse("Hello, World!");
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data, "Hello, World!");
  }
});

Deno.test("nonEmptyStringSchema: 空文字を拒否", () => {
  const result = nonEmptyStringSchema.safeParse("");
  assertEquals(result.success, false);
});

Deno.test("nonEmptyStringSchema: 空白のみの文字列を許可", () => {
  // 空白のみの文字列は許可される（trimはしない）
  const result = nonEmptyStringSchema.safeParse("   ");
  assertEquals(result.success, true);
});

// i18n対応のテスト
Deno.test({
  name: "channelIdSchema: エラーメッセージが英語で表示される",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
    setLocale("en");
    const schema = createChannelIdSchema();
    const result = schema.safeParse("invalid");

    assertEquals(result.success, false);
    if (!result.success) {
      assertEquals(
        result.error.errors[0].message,
        "Channel ID must start with 'C' followed by uppercase alphanumeric characters",
      );
    }
    setLocale(originalLocale); // 元に戻す
  },
});

Deno.test({
  name: "channelIdSchema: エラーメッセージが日本語で表示される",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
    setLocale("ja");
    const schema = createChannelIdSchema();
    const result = schema.safeParse("invalid");

    assertEquals(result.success, false);
    if (!result.success) {
      // 日本語のエラーメッセージを確認（部分一致）
      assertEquals(
        result.error.errors[0].message.includes("チャンネルID"),
        true,
      );
    }
    setLocale(originalLocale); // 元に戻す
  },
});

Deno.test({
  name: "userIdSchema: エラーメッセージが英語で表示される",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
    setLocale("en");
    const schema = createUserIdSchema();
    const result = schema.safeParse("invalid");

    assertEquals(result.success, false);
    if (!result.success) {
      assertEquals(
        result.error.errors[0].message,
        "User ID must start with 'U' or 'W' followed by uppercase alphanumeric characters",
      );
    }
    setLocale(originalLocale); // 元に戻す
  },
});

Deno.test({
  name: "userIdSchema: 空のユーザーIDでエラーメッセージが日本語で表示される",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
    setLocale("ja");
    const schema = createUserIdSchema();
    const result = schema.safeParse("");

    assertEquals(result.success, false);
    if (!result.success) {
      // 日本語のエラーメッセージを確認（部分一致）
      assertEquals(
        result.error.errors[0].message.includes("ユーザーID"),
        true,
      );
    }
    setLocale(originalLocale); // 元に戻す
  },
});

Deno.test({
  name: "nonEmptyStringSchema: エラーメッセージが英語で表示される",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
    setLocale("en");
    const schema = createNonEmptyStringSchema();
    const result = schema.safeParse("");

    assertEquals(result.success, false);
    if (!result.success) {
      assertEquals(
        result.error.errors[0].message,
        "Value cannot be empty",
      );
    }
    setLocale(originalLocale); // 元に戻す
  },
});

Deno.test({
  name: "nonEmptyStringSchema: エラーメッセージが日本語で表示される",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
    setLocale("ja");
    const schema = createNonEmptyStringSchema();
    const result = schema.safeParse("");

    assertEquals(result.success, false);
    if (!result.success) {
      // 日本語のエラーメッセージを確認（部分一致）
      assertEquals(
        result.error.errors[0].message.includes("空"),
        true,
      );
    }
    setLocale(originalLocale); // 元に戻す
  },
});

Deno.test({
  name: "デフォルトスキーマ: ロケール変更に動的に対応する",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
    // 英語でバリデーション（デフォルトスキーマ使用）
    setLocale("en");
    const result1 = channelIdSchema.safeParse("invalid");
    assertEquals(result1.success, false);
    if (!result1.success) {
      assertEquals(
        result1.error.errors[0].message,
        "Channel ID must start with 'C' followed by uppercase alphanumeric characters",
      );
    }

    // 同じスキーマインスタンスで日本語に切り替え
    setLocale("ja");
    const result2 = channelIdSchema.safeParse("invalid");
    assertEquals(result2.success, false);
    if (!result2.success) {
      // 日本語のエラーメッセージが表示される
      assertEquals(
        result2.error.errors[0].message.includes("チャンネルID"),
        true,
      );
    }

    // 英語に戻す
    setLocale("en");
    const result3 = channelIdSchema.safeParse("invalid");
    assertEquals(result3.success, false);
    if (!result3.success) {
      // 再び英語のエラーメッセージが表示される
      assertEquals(
        result3.error.errors[0].message,
        "Channel ID must start with 'C' followed by uppercase alphanumeric characters",
      );
    }

    setLocale(originalLocale); // 元に戻す
  },
});

// === Soracom バリデーションテスト ===

Deno.test("simIdSchema: 正常なSIM ID（18桁）を検証", () => {
  const result = simIdSchema.safeParse("894231002200001234");
  assertEquals(result.success, true);
});

Deno.test("simIdSchema: 正常なSIM ID（22桁）を検証", () => {
  const result = simIdSchema.safeParse("8942310022000012345678");
  assertEquals(result.success, true);
});

Deno.test("simIdSchema: 不正なSIM ID（文字を含む）を拒否", () => {
  const result = simIdSchema.safeParse("894231002200ABC");
  assertEquals(result.success, false);
});

Deno.test("simIdSchema: 短すぎるSIM IDを拒否", () => {
  const result = simIdSchema.safeParse("12345");
  assertEquals(result.success, false);
});

Deno.test("simIdSchema: 空文字を拒否", () => {
  const result = simIdSchema.safeParse("");
  assertEquals(result.success, false);
});

Deno.test("imsiSchema: 正常なIMSI（15桁）を検証", () => {
  const result = imsiSchema.safeParse("440101234567890");
  assertEquals(result.success, true);
});

Deno.test("imsiSchema: 不正なIMSI（14桁）を拒否", () => {
  const result = imsiSchema.safeParse("44010123456789");
  assertEquals(result.success, false);
});

Deno.test("imsiSchema: 不正なIMSI（文字を含む）を拒否", () => {
  const result = imsiSchema.safeParse("44010123456789A");
  assertEquals(result.success, false);
});

Deno.test("imsiSchema: 空文字を拒否", () => {
  const result = imsiSchema.safeParse("");
  assertEquals(result.success, false);
});

Deno.test("coverageTypeSchema: 'jp'を検証", () => {
  const result = coverageTypeSchema.safeParse("jp");
  assertEquals(result.success, true);
});

Deno.test("coverageTypeSchema: 'g'を検証", () => {
  const result = coverageTypeSchema.safeParse("g");
  assertEquals(result.success, true);
});

Deno.test("coverageTypeSchema: 不正な値を拒否", () => {
  const result = coverageTypeSchema.safeParse("us");
  assertEquals(result.success, false);
});

Deno.test("statsPeriodSchema: 'day'を検証", () => {
  const result = statsPeriodSchema.safeParse("day");
  assertEquals(result.success, true);
});

Deno.test("statsPeriodSchema: 'month'を検証", () => {
  const result = statsPeriodSchema.safeParse("month");
  assertEquals(result.success, true);
});

Deno.test("statsPeriodSchema: 不正な値を拒否", () => {
  const result = statsPeriodSchema.safeParse("week");
  assertEquals(result.success, false);
});

Deno.test("airQualityReportPeriodSchema: '1h'を検証", () => {
  const result = airQualityReportPeriodSchema.safeParse("1h");
  assertEquals(result.success, true);
});

Deno.test("gpsMultiunitPeriodSchema: '1h'と'1d'を検証", () => {
  assertEquals(gpsMultiunitPeriodSchema.safeParse("1h").success, true);
  assertEquals(gpsMultiunitPeriodSchema.safeParse("1d").success, true);
  assertEquals(gpsMultiunitPeriodSchema.safeParse("1m").success, false);
});

Deno.test("gpsMultiunitSampleCountSchema: 1〜24の整数を検証", () => {
  assertEquals(gpsMultiunitSampleCountSchema.safeParse(1).success, true);
  assertEquals(gpsMultiunitSampleCountSchema.safeParse(24).success, true);
  assertEquals(gpsMultiunitSampleCountSchema.safeParse(0).success, false);
  assertEquals(gpsMultiunitSampleCountSchema.safeParse(25).success, false);
  assertEquals(gpsMultiunitSampleCountSchema.safeParse(1.5).success, false);
});

Deno.test("latitudeSchema: 正常範囲の緯度を検証", () => {
  assertEquals(latitudeSchema.safeParse(35.681236).success, true);
  assertEquals(latitudeSchema.safeParse(-90).success, true);
  assertEquals(latitudeSchema.safeParse(90).success, true);
  assertEquals(latitudeSchema.safeParse(90.1).success, false);
});

Deno.test("longitudeSchema: 正常範囲の経度を検証", () => {
  assertEquals(longitudeSchema.safeParse(139.767125).success, true);
  assertEquals(longitudeSchema.safeParse(-180).success, true);
  assertEquals(longitudeSchema.safeParse(180).success, true);
  assertEquals(longitudeSchema.safeParse(-180.1).success, false);
});

Deno.test("radiusMetersSchema: 正の有限数を検証", () => {
  assertEquals(radiusMetersSchema.safeParse(1).success, true);
  assertEquals(radiusMetersSchema.safeParse(150.5).success, true);
  assertEquals(radiusMetersSchema.safeParse(0).success, false);
  assertEquals(radiusMetersSchema.safeParse(-1).success, false);
});

Deno.test({
  name: "simIdSchema: エラーメッセージが英語で表示される",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
    setLocale("en");
    const schema = createSimIdSchema();
    const result = schema.safeParse("invalid");

    assertEquals(result.success, false);
    if (!result.success) {
      assertEquals(
        result.error.errors[0].message.includes("SIM ID"),
        true,
      );
    }
    setLocale(originalLocale);
  },
});

Deno.test({
  name: "imsiSchema: エラーメッセージが日本語で表示される",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
    setLocale("ja");
    const schema = createImsiSchema();
    const result = schema.safeParse("invalid");

    assertEquals(result.success, false);
    if (!result.success) {
      assertEquals(
        result.error.errors[0].message.includes("IMSI"),
        true,
      );
    }
    setLocale(originalLocale);
  },
});

Deno.test({
  name: "gpsMultiunitPeriodSchema: エラーメッセージが英語で表示される",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
    setLocale("en");
    const schema = createGpsMultiunitPeriodSchema();
    const result = schema.safeParse("1m");

    assertEquals(result.success, false);
    if (!result.success) {
      assertEquals(
        result.error.errors[0].message.includes("GPS multiunit period"),
        true,
      );
    }
    setLocale(originalLocale);
  },
});

Deno.test({
  name: "gpsMultiunitSampleCountSchema: エラーメッセージが日本語で表示される",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
    setLocale("ja");
    const schema = createGpsMultiunitSampleCountSchema();
    const result = schema.safeParse(0);

    assertEquals(result.success, false);
    if (!result.success) {
      assertEquals(
        result.error.errors[0].message.includes("サンプル数"),
        true,
      );
    }
    setLocale(originalLocale);
  },
});

Deno.test({
  name: "latitudeSchema: エラーメッセージが英語で表示される",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
    setLocale("en");
    const schema = createLatitudeSchema();
    const result = schema.safeParse(100);

    assertEquals(result.success, false);
    if (!result.success) {
      assertEquals(
        result.error.errors[0].message.includes("Latitude"),
        true,
      );
    }
    setLocale(originalLocale);
  },
});

Deno.test({
  name: "longitudeSchema: エラーメッセージが日本語で表示される",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
    setLocale("ja");
    const schema = createLongitudeSchema();
    const result = schema.safeParse(200);

    assertEquals(result.success, false);
    if (!result.success) {
      assertEquals(
        result.error.errors[0].message.includes("経度"),
        true,
      );
    }
    setLocale(originalLocale);
  },
});

Deno.test({
  name: "radiusMetersSchema: エラーメッセージが英語で表示される",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
    setLocale("en");
    const schema = createRadiusMetersSchema();
    const result = schema.safeParse(0);

    assertEquals(result.success, false);
    if (!result.success) {
      assertEquals(
        result.error.errors[0].message.includes("Radius"),
        true,
      );
    }
    setLocale(originalLocale);
  },
});

// === SoraCam デバイスID バリデーションテスト ===

Deno.test("soraCamDeviceIdSchema: 正常なデバイスIDを検証", () => {
  const result = soraCamDeviceIdSchema.safeParse("7C12345678AB");
  assertEquals(result.success, true);
});

Deno.test("soraCamDeviceIdSchema: ハイフン付きデバイスIDを検証", () => {
  const result = soraCamDeviceIdSchema.safeParse("7C-1234-5678-AB");
  assertEquals(result.success, true);
});

Deno.test("soraCamDeviceIdSchema: 空文字を拒否", () => {
  const result = soraCamDeviceIdSchema.safeParse("");
  assertEquals(result.success, false);
});

Deno.test("soraCamDeviceIdSchema: 特殊文字を含むIDを拒否", () => {
  const result = soraCamDeviceIdSchema.safeParse("7C@#$%");
  assertEquals(result.success, false);
});

Deno.test({
  name: "soraCamDeviceIdSchema: エラーメッセージが英語で表示される",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
    setLocale("en");
    const schema = createSoraCamDeviceIdSchema();
    const result = schema.safeParse("invalid@device");

    assertEquals(result.success, false);
    if (!result.success) {
      assertEquals(
        result.error.errors[0].message.includes("SoraCam"),
        true,
      );
    }
    setLocale(originalLocale);
  },
});
