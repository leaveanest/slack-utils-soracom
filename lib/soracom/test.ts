import { assertEquals } from "std/testing/asserts.ts";
import {
  createSoracomClientFromEnv,
  formatBytes,
  normalizeAirStatsDataPoints,
  normalizeSoracomSim,
  SoracomClient,
} from "./mod.ts";

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
      date: 1773792000,
      uploadByteSizeTotal: 110,
      downloadByteSizeTotal: 220,
      uploadPacketSizeTotal: 4,
      downloadPacketSizeTotal: 6,
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
