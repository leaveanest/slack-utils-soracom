import { assertEquals, assertThrows } from "std/testing/asserts.ts";
import { getOptionalEnv, getRuntimeEnv } from "./env.ts";

Deno.test("env値をそのまま返す", () => {
  const value = getOptionalEnv(
    "TEST_ENV",
    (name) => name === "TEST_ENV" ? "value" : undefined,
  );

  assertEquals(value, "value");
});

Deno.test("envアクセス不可の場合はundefinedを返す", () => {
  const value = getOptionalEnv("TEST_ENV", () => {
    throw new Deno.errors.NotCapable("env access is not permitted");
  });

  assertEquals(value, undefined);
});

Deno.test("想定外のエラーは再throwする", () => {
  assertThrows(
    () =>
      getOptionalEnv("TEST_ENV", () => {
        throw new Error("unexpected failure");
      }),
    Error,
    "unexpected failure",
  );
});

Deno.test("runtime envがあればそちらを優先する", () => {
  const value = getRuntimeEnv(
    "TEST_ENV",
    { TEST_ENV: "runtime-value" },
    () => "reader-value",
  );

  assertEquals(value, "runtime-value");
});

Deno.test("runtime envに無ければreaderへフォールバックする", () => {
  const value = getRuntimeEnv(
    "TEST_ENV",
    {},
    (name) => name === "TEST_ENV" ? "reader-value" : undefined,
  );

  assertEquals(value, "reader-value");
});
