import { assertEquals, assertRejects } from "std/testing/asserts.ts";
import { stub } from "std/testing/mock.ts";
import { initI18n, setLocale } from "../i18n/mod.ts";
import { downloadSoraCamSnapshot } from "./snapshot.ts";

async function prepareLocale(locale: "en" | "ja" = "ja"): Promise<void> {
  await initI18n();
  setLocale(locale);
}

function stubImmediateTimeout() {
  return stub(
    globalThis,
    "setTimeout",
    ((
      handler: (...args: unknown[]) => void,
      _timeout?: number,
      ...args: unknown[]
    ) => {
      handler(...args);
      return 0 as never;
    }) as unknown as typeof setTimeout,
  );
}

Deno.test("downloadSoraCamSnapshot: fetch 例外の直後に再試行で成功する", async () => {
  await prepareLocale("ja");

  let fetchCalls = 0;
  const fetchStub = stub(
    globalThis,
    "fetch",
    () => {
      fetchCalls += 1;

      if (fetchCalls === 1) {
        return Promise.reject(new TypeError("temporary_network_error"));
      }

      return Promise.resolve(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
        }),
      );
    },
  );
  const setTimeoutStub = stubImmediateTimeout();

  try {
    const snapshot = await downloadSoraCamSnapshot(
      "device-1",
      "https://image.local/device-1.jpg",
    );

    assertEquals(fetchCalls, 2);
    assertEquals(Array.from(snapshot), [1, 2, 3]);
  } finally {
    fetchStub.restore();
    setTimeoutStub.restore();
  }
});

Deno.test("downloadSoraCamSnapshot: 500 応答が続く場合は既存エラーで失敗する", async () => {
  await prepareLocale("ja");

  let fetchCalls = 0;
  const fetchStub = stub(
    globalThis,
    "fetch",
    () => {
      fetchCalls += 1;

      return Promise.resolve(
        new Response(null, {
          status: 500,
          statusText: "Internal Server Error",
        }),
      );
    },
  );
  const setTimeoutStub = stubImmediateTimeout();

  try {
    await assertRejects(
      () =>
        downloadSoraCamSnapshot(
          "device-1",
          "https://image.local/device-1.jpg",
        ),
      Error,
      "HTTP 500",
    );

    assertEquals(fetchCalls, 3);
  } finally {
    fetchStub.restore();
    setTimeoutStub.restore();
  }
});
