import { assertEquals, assertThrows } from "std/testing/asserts.ts";
import {
  formatSensorProfileSavedMessage,
  normalizeSensorProfileInputs,
} from "./mod.ts";

Deno.test({
  name: "センサープロファイル入力を正規化できる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const normalized = normalizeSensorProfileInputs({
      sensor_name: " 会議室CO2センサー ",
      imsi: "440101234567890",
      report_channel_id: "C1234567890",
      co2_threshold: 1200,
      soracam_device_id: "camera-1",
      lookback_hours: 12,
    });

    assertEquals(normalized.sensorName, "会議室CO2センサー");
    assertEquals(normalized.reportChannelId, "C1234567890");
    assertEquals(normalized.co2Threshold, 1200);
    assertEquals(normalized.soraCamDeviceId, "camera-1");
  },
});

Deno.test({
  name: "不正な数値設定でバリデーションが失敗する",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    assertThrows(
      () =>
        normalizeSensorProfileInputs({
          sensor_name: "会議室CO2センサー",
          imsi: "440101234567890",
          report_channel_id: "C1234567890",
          co2_threshold: 0,
        }),
      Error,
    );
  },
});

Deno.test({
  name: "センサープロファイル保存メッセージが正しくフォーマットされる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatSensorProfileSavedMessage({
      sensorName: "会議室CO2センサー",
      imsi: "440101234567890",
      reportChannelId: "C1234567890",
      co2Threshold: 1000,
      soraCamDeviceId: "camera-1",
      lookbackHours: 24,
    });

    assertEquals(message.includes("会議室CO2センサー"), true);
    assertEquals(message.includes("440101234567890"), true);
    assertEquals(message.includes("camera-1"), true);
    assertEquals(message.includes("24"), true);
  },
});
