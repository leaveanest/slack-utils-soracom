import { assertEquals } from "std/testing/asserts.ts";
import { listSensorProfiles, upsertSensorProfile } from "./sensor_profiles.ts";

function createMockClient(store: Record<string, Record<string, unknown>> = {}) {
  return {
    apps: {
      datastore: {
        put: (
          params: { datastore: string; item: Record<string, unknown> },
        ) => {
          store[params.item.imsi as string] = params.item;
          return Promise.resolve({ ok: true });
        },
        query: (_params: { datastore: string }) => {
          return Promise.resolve({ ok: true, items: Object.values(store) });
        },
      },
    },
  };
}

function createErrorClient() {
  return {
    apps: {
      datastore: {
        put: (
          _params: { datastore: string; item: Record<string, unknown> },
        ) => {
          return Promise.resolve({ ok: false, error: "write_error" });
        },
        query: (_params: { datastore: string }) => {
          return Promise.resolve({ ok: false });
        },
      },
    },
  };
}

Deno.test({
  name: "センサープロファイルを正常に保存できる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const store: Record<string, Record<string, unknown>> = {};
    const client = createMockClient(store);

    await upsertSensorProfile(
      client,
      {
        imsi: "440101234567890",
        sensorName: "会議室CO2センサー",
        reportChannelId: "C1111111111",
        co2Threshold: 1200,
        soraCamDeviceId: "camera-1",
        lookbackHours: 12,
      },
      "U12345",
    );

    assertEquals(store["440101234567890"].sensor_name, "会議室CO2センサー");
    assertEquals(store["440101234567890"].report_channel_id, "C1111111111");
    assertEquals(store["440101234567890"].co2_threshold, 1200);
  },
});

Deno.test({
  name: "センサープロファイル書き込み失敗時はエラーを返す",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const client = createErrorClient();

    let message = "";
    try {
      await upsertSensorProfile(
        client,
        {
          imsi: "440101234567890",
          sensorName: "会議室CO2センサー",
          reportChannelId: "C1111111111",
        },
        "U12345",
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    assertEquals(message.length > 0, true);
  },
});

Deno.test({
  name: "センサープロファイル一覧を正規化して取得できる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const client = createMockClient({
      "440101234567891": {
        imsi: "440101234567891",
        sensor_name: "B会議室",
        report_channel_id: "C2222222222",
      },
      "440101234567890": {
        imsi: "440101234567890",
        sensor_name: "A会議室",
        report_channel_id: "C1111111111",
        co2_threshold: 1000,
        soracam_device_id: "camera-1",
        lookback_hours: 24,
      },
      invalid: {
        sensor_name: "broken",
      },
    });

    const profiles = await listSensorProfiles(client);

    assertEquals(profiles.length, 2);
    assertEquals(profiles[0].sensorName, "A会議室");
    assertEquals(profiles[0].soraCamDeviceId, "camera-1");
    assertEquals(profiles[1].sensorName, "B会議室");
  },
});
