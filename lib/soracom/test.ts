import { assertEquals, assertRejects } from "std/testing/asserts.ts";
import { stub } from "std/testing/mock.ts";
import {
  createSoracomClientFromEnv,
  formatBytes,
  normalizeAirStatsDataPoints,
  normalizeSoracomSim,
  SoracomClient,
} from "./mod.ts";

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

Deno.test("formatBytes: 0バイトを正常にフォーマットする", () => {
  assertEquals(formatBytes(0), "0 B");
});

Deno.test("formatBytes: バイト単位を正常にフォーマットする", () => {
  assertEquals(formatBytes(500), "500.00 B");
});

Deno.test("formatBytes: KBを正常にフォーマットする", () => {
  assertEquals(formatBytes(1024), "1.00 KB");
});

Deno.test("formatBytes: MBを正常にフォーマットする", () => {
  assertEquals(formatBytes(1048576), "1.00 MB");
});

Deno.test("formatBytes: GBを正常にフォーマットする", () => {
  assertEquals(formatBytes(1073741824), "1.00 GB");
});

Deno.test("formatBytes: 小数点を含む値を正常にフォーマットする", () => {
  assertEquals(formatBytes(1536), "1.50 KB");
});

Deno.test("createSoracomClientFromEnv: runtime envからクライアントを生成できる", () => {
  const client = createSoracomClientFromEnv({
    SORACOM_AUTH_KEY_ID: "key-id",
    SORACOM_AUTH_KEY: "secret",
    SORACOM_COVERAGE_TYPE: "g",
  });

  assertEquals(client instanceof SoracomClient, true);
});

Deno.test("normalizeAirStatsDataPoints: SIM IDベースAPIの形式を正規化できる", () => {
  const normalized = normalizeAirStatsDataPoints([
    {
      date: "20260318",
      unixtime: 1773792000,
      dataTrafficStatsMap: {
        "s1.fast": {
          uploadByteSizeTotal: 100,
          downloadByteSizeTotal: 200,
          uploadPacketSizeTotal: 3,
          downloadPacketSizeTotal: 4,
        },
        "s1.4xfast": {
          uploadByteSizeTotal: 10,
          downloadByteSizeTotal: 20,
          uploadPacketSizeTotal: 1,
          downloadPacketSizeTotal: 2,
        },
      },
    },
  ]);

  assertEquals(normalized, [
    {
      date: 1773792000000,
      uploadByteSizeTotal: 110,
      downloadByteSizeTotal: 220,
      uploadPacketSizeTotal: 4,
      downloadPacketSizeTotal: 6,
    },
  ]);
});

Deno.test("normalizeAirStatsDataPoints: UNIX秒のdateもミリ秒へ正規化できる", () => {
  const normalized = normalizeAirStatsDataPoints([
    {
      date: 1773792000,
      uploadByteSizeTotal: 1,
      downloadByteSizeTotal: 2,
      uploadPacketSizeTotal: 3,
      downloadPacketSizeTotal: 4,
    },
  ]);

  assertEquals(normalized, [
    {
      date: 1773792000000,
      uploadByteSizeTotal: 1,
      downloadByteSizeTotal: 2,
      uploadPacketSizeTotal: 3,
      downloadPacketSizeTotal: 4,
    },
  ]);
});

Deno.test("normalizeSoracomSim: ネストされた SIM レスポンスを正規化できる", () => {
  const normalized = normalizeSoracomSim({
    operatorId: "OP001",
    simId: "8981100067203921953",
    status: "active",
    speedClass: "s1.4xfast",
    tags: { name: "GPSトラッカー" },
    groupId: "group-1",
    moduleType: "nano",
    createdTime: 1760598494199,
    lastModifiedTime: 1768378247174,
    activeProfileId: "8981100067203921953",
    profiles: {
      "8981100067203921953": {
        primaryImsi: "440103269638173",
        subscribers: {
          "440103269638173": {
            imsi: "440103269638173",
            msisdn: "812012345577",
            status: "active",
            subscription: "plan-D",
          },
        },
      },
    },
    sessionStatus: {
      imsi: "440103269638173",
      ueIpAddress: "10.10.10.10",
      subscription: "plan-D",
    },
  });

  assertEquals(normalized, {
    operatorId: "OP001",
    simId: "8981100067203921953",
    imsi: "440103269638173",
    msisdn: "812012345577",
    status: "active",
    speedClass: "s1.4xfast",
    tags: { name: "GPSトラッカー" },
    ipAddress: "10.10.10.10",
    createdAt: 1760598494199,
    lastModifiedAt: 1768378247174,
    groupId: "group-1",
    subscription: "plan-D",
    moduleType: "nano",
  });
});

Deno.test("listSims: 次ページキーをレスポンスヘッダーから取得できる", async () => {
  const client = new SoracomClient({
    authKeyId: "key-id",
    authKey: "secret",
    coverageType: "jp",
  });

  const fetchStub = stub(
    globalThis,
    "fetch",
    (input: string | URL | Request) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

      if (url.endsWith("/auth")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              apiKey: "api-key",
              token: "api-token",
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
        );
      }

      const requestUrl = new URL(url);
      assertEquals(requestUrl.pathname, "/v1/sims");
      assertEquals(requestUrl.searchParams.get("limit"), "50");
      assertEquals(requestUrl.searchParams.get("last_evaluated_key"), null);

      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              simId: "sim-1",
              imsi: "440101234567890",
              status: "active",
              groupId: "group-1",
              tags: { name: "Device-01" },
            },
          ]),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "x-soracom-next-key": "next-1",
            },
          },
        ),
      );
    },
  );

  try {
    const result = await client.listSims(50);

    assertEquals(result.total, 1);
    assertEquals(result.nextKey, "next-1");
    assertEquals(result.sims[0].groupId, "group-1");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("listAllSims: 次ページキーをたどって全 SIM を取得できる", async () => {
  const client = new SoracomClient({
    authKeyId: "key-id",
    authKey: "secret",
    coverageType: "jp",
  });

  const fetchStub = stub(
    globalThis,
    "fetch",
    (input: string | URL | Request) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

      if (url.endsWith("/auth")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              apiKey: "api-key",
              token: "api-token",
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
        );
      }

      const requestUrl = new URL(url);
      assertEquals(requestUrl.pathname, "/v1/sims");
      assertEquals(requestUrl.searchParams.get("limit"), "2");

      if (requestUrl.searchParams.get("last_evaluated_key") === null) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                simId: "sim-1",
                imsi: "440101234567890",
                status: "active",
                groupId: "group-1",
              },
              {
                simId: "sim-2",
                imsi: "440101234567891",
                status: "inactive",
                groupId: "group-1",
              },
            ]),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "x-soracom-next-key": "next-1",
              },
            },
          ),
        );
      }

      assertEquals(requestUrl.searchParams.get("last_evaluated_key"), "next-1");

      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              simId: "sim-3",
              imsi: "440101234567892",
              status: "active",
              groupId: "group-2",
            },
          ]),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );
    },
  );

  try {
    const sims = await client.listAllSims(2);

    assertEquals(sims.map((sim) => sim.simId), ["sim-1", "sim-2", "sim-3"]);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("listSoraCamDevices: connected フラグを状態表示用の文字列へ正規化できる", async () => {
  const client = new SoracomClient({
    authKeyId: "key-id",
    authKey: "secret",
    coverageType: "jp",
  });

  const fetchStub = stub(
    globalThis,
    "fetch",
    (input: string | URL | Request) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

      if (url.endsWith("/auth")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              apiKey: "api-key",
              token: "api-token",
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
        );
      }

      const requestUrl = new URL(url);
      assertEquals(requestUrl.pathname, "/v1/sora_cam/devices");

      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              connected: true,
              deviceId: "7CDDE907B5FF",
              firmwareVersion: "4.58.0.171",
              lastConnectedTime: 1773779980925,
              name: "テスト用カメラ",
            },
            {
              connected: false,
              deviceId: "7C12345678AB",
              firmwareVersion: "4.37.1.106",
              lastConnectedTime: "1773600000000",
              name: "予備カメラ",
            },
          ]),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );
    },
  );

  try {
    const devices = await client.listSoraCamDevices();

    assertEquals(devices, [
      {
        deviceId: "7CDDE907B5FF",
        name: "テスト用カメラ",
        status: "online",
        firmwareVersion: "4.58.0.171",
        lastConnectedTime: 1773779980925,
      },
      {
        deviceId: "7C12345678AB",
        name: "予備カメラ",
        status: "offline",
        firmwareVersion: "4.37.1.106",
        lastConnectedTime: 1773600000000,
      },
    ]);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("getHarvestData: JSON文字列のcontentをパースして取得できる", async () => {
  const client = new SoracomClient({
    authKeyId: "key-id",
    authKey: "secret",
    coverageType: "jp",
  });

  const fetchStub = stub(
    globalThis,
    "fetch",
    (input: string | URL | Request) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

      if (url.endsWith("/auth")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              apiKey: "api-key",
              token: "api-token",
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
        );
      }

      const requestUrl = new URL(url);
      assertEquals(
        requestUrl.pathname,
        "/v1/data/Subscriber/440101234567890",
      );
      assertEquals(requestUrl.searchParams.get("from"), "1700000000000");
      assertEquals(requestUrl.searchParams.get("to"), "1700003600000");
      assertEquals(requestUrl.searchParams.get("sort"), "desc");
      assertEquals(requestUrl.searchParams.get("limit"), "1000");

      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              time: 1700003500000,
              contentType: "application/json",
              content: '{"co2":547,"temp":23.4,"humid":45}',
            },
          ]),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );
    },
  );

  try {
    const result = await client.getHarvestData(
      "440101234567890",
      1700000000000,
      1700003600000,
    );

    assertEquals(result.entries, [
      {
        time: 1700003500000,
        contentType: "application/json",
        content: {
          co2: 547,
          temp: 23.4,
          humid: 45,
        },
      },
    ]);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("getHarvestData: 指定期間のデータを複数回取得して連結できる", async () => {
  const client = new SoracomClient({
    authKeyId: "key-id",
    authKey: "secret",
    coverageType: "jp",
  });

  let harvestCallCount = 0;
  const fetchStub = stub(
    globalThis,
    "fetch",
    (input: string | URL | Request) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

      if (url.endsWith("/auth")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              apiKey: "api-key",
              token: "api-token",
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
        );
      }

      const requestUrl = new URL(url);
      assertEquals(
        requestUrl.pathname,
        "/v1/data/Subscriber/440101234567890",
      );
      assertEquals(requestUrl.searchParams.get("from"), "1000");
      assertEquals(requestUrl.searchParams.get("sort"), "desc");
      assertEquals(requestUrl.searchParams.get("limit"), "2");

      harvestCallCount += 1;

      if (harvestCallCount === 1) {
        assertEquals(requestUrl.searchParams.get("to"), "4000");
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                time: 4000,
                contentType: "application/json",
                content: '{"co2":900}',
              },
              {
                time: 3000,
                contentType: "application/json",
                content: '{"co2":800}',
              },
            ]),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
        );
      }

      assertEquals(harvestCallCount, 2);
      assertEquals(requestUrl.searchParams.get("to"), "2999");

      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              time: 2000,
              contentType: "application/json",
              content: '{"co2":700}',
            },
          ]),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );
    },
  );

  try {
    const result = await client.getHarvestData(
      "440101234567890",
      1000,
      4000,
      "desc",
      2,
    );

    assertEquals(result.entries.map((entry) => entry.time), [4000, 3000, 2000]);
    assertEquals(harvestCallCount, 2);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("getSoraCamEvents: recordings_and_events の events を共通形式に正規化できる", async () => {
  const client = new SoracomClient({
    authKeyId: "key-id",
    authKey: "secret",
    coverageType: "jp",
  });

  const fetchStub = stub(
    globalThis,
    "fetch",
    (input: string | URL | Request) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

      if (url.endsWith("/auth")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              apiKey: "api-key",
              token: "api-token",
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
        );
      }

      const requestUrl = new URL(url);
      assertEquals(
        requestUrl.pathname,
        "/v1/sora_cam/devices/device-1/recordings_and_events",
      );
      assertEquals(requestUrl.searchParams.get("from"), "1700000000000");
      assertEquals(requestUrl.searchParams.get("to"), "1700003600000");
      assertEquals(requestUrl.searchParams.get("sort"), "desc");

      return Promise.resolve(
        new Response(
          JSON.stringify({
            records: [],
            events: [
              {
                type: "motion",
                startTime: 1700003500000,
                endTime: 1700003510000,
              },
              {
                type: "sound",
                startTime: 1700002500000,
              },
              {
                startTime: 1700001500000,
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );
    },
  );

  try {
    const events = await client.getSoraCamEvents(
      "device-1",
      1700000000000,
      1700003600000,
    );

    assertEquals(events, [
      {
        deviceId: "device-1",
        eventType: "motion",
        eventTime: 1700003500000,
        eventInfo: {
          endTime: 1700003510000,
        },
      },
      {
        deviceId: "device-1",
        eventType: "sound",
        eventTime: 1700002500000,
        eventInfo: {},
      },
    ]);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("listSoraCamRecordingsAndEvents: null 応答を空配列として扱える", async () => {
  const client = new SoracomClient({
    authKeyId: "key-id",
    authKey: "secret",
    coverageType: "jp",
  });

  const fetchStub = stub(
    globalThis,
    "fetch",
    (input: string | URL | Request) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

      if (url.endsWith("/auth")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              apiKey: "api-key",
              token: "api-token",
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
        );
      }

      const requestUrl = new URL(url);
      assertEquals(
        requestUrl.pathname,
        "/v1/sora_cam/devices/device-1/recordings_and_events",
      );

      return Promise.resolve(
        new Response("null", {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }),
      );
    },
  );

  try {
    const result = await client.listSoraCamRecordingsAndEvents("device-1");

    assertEquals(result, {
      records: [],
      events: [],
    });
  } finally {
    fetchStub.restore();
  }
});

Deno.test("getSoraCamImageExport: 一時的な 500 応答後に再試行で成功する", async () => {
  const client = new SoracomClient({
    authKeyId: "key-id",
    authKey: "secret",
    coverageType: "jp",
  });

  let exportStatusCalls = 0;
  const fetchStub = stub(
    globalThis,
    "fetch",
    (input: string | URL | Request) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

      if (url.endsWith("/auth")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              apiKey: "api-key",
              token: "api-token",
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
        );
      }

      const requestUrl = new URL(url);
      assertEquals(
        requestUrl.pathname,
        "/v1/sora_cam/devices/device-1/images/exports/export-1",
      );
      exportStatusCalls += 1;

      if (exportStatusCalls === 1) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              message: "temporary_error",
            }),
            {
              status: 500,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            exportId: "export-1",
            deviceId: "device-1",
            status: "completed",
            url: "https://image.local/device-1.jpg",
            requestedTime: 1700000000000,
            completedTime: 1700000001000,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );
    },
  );
  const setTimeoutStub = stubImmediateTimeout();

  try {
    const result = await client.getSoraCamImageExport("device-1", "export-1");

    assertEquals(exportStatusCalls, 2);
    assertEquals(result.status, "completed");
    assertEquals(result.url, "https://image.local/device-1.jpg");
  } finally {
    fetchStub.restore();
    setTimeoutStub.restore();
  }
});

Deno.test("exportSoraCamImage: 画像エクスポートを正常に作成できる", async () => {
  const client = new SoracomClient({
    authKeyId: "key-id",
    authKey: "secret",
    coverageType: "jp",
  });

  const fetchStub = stub(
    globalThis,
    "fetch",
    (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

      if (url.endsWith("/auth")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              apiKey: "api-key",
              token: "api-token",
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
        );
      }

      const requestUrl = new URL(url);
      assertEquals(
        requestUrl.pathname,
        "/v1/sora_cam/devices/device-1/images/exports",
      );
      assertEquals(init?.method, "POST");
      assertEquals(init?.body, JSON.stringify({ time: 1700000000000 }));

      return Promise.resolve(
        new Response(
          JSON.stringify({
            exportId: "export-1",
            deviceId: "device-1",
            status: "processing",
            requestedTime: 1700000000000,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );
    },
  );

  try {
    const result = await client.exportSoraCamImage("device-1", 1700000000000);

    assertEquals(result.exportId, "export-1");
    assertEquals(result.status, "processing");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("exportSoraCamImage: 404 応答は指定時刻の録画未検出エラーに変換する", async () => {
  const client = new SoracomClient({
    authKeyId: "key-id",
    authKey: "secret",
    coverageType: "jp",
  });

  const fetchStub = stub(
    globalThis,
    "fetch",
    (input: string | URL | Request) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

      if (url.endsWith("/auth")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              apiKey: "api-key",
              token: "api-token",
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            message:
              "recorded video for the specified device was not found the specified period of time",
          }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );
    },
  );

  try {
    await assertRejects(
      () => client.exportSoraCamImage("device-1", 1700000000000),
      Error,
      "デバイス device-1 の指定時刻 2023-11-15 07:13:20 JST の録画が見つかりません",
    );
  } finally {
    fetchStub.restore();
  }
});

Deno.test("getSoraCamImageExport: 4xx 応答は再試行せず即失敗する", async () => {
  const client = new SoracomClient({
    authKeyId: "key-id",
    authKey: "secret",
    coverageType: "jp",
  });

  let exportStatusCalls = 0;
  const fetchStub = stub(
    globalThis,
    "fetch",
    (input: string | URL | Request) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

      if (url.endsWith("/auth")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              apiKey: "api-key",
              token: "api-token",
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
        );
      }

      exportStatusCalls += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            message: "not_found",
          }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );
    },
  );

  try {
    await assertRejects(
      () => client.getSoraCamImageExport("device-1", "export-1"),
      Error,
      "404",
    );

    assertEquals(exportStatusCalls, 1);
  } finally {
    fetchStub.restore();
  }
});
