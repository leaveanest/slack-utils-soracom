import { assertEquals } from "std/testing/asserts.ts";
import {
  formatGpsMultiunitGeofenceReportMessage,
  GpsMultiunitGeofenceReportFunctionDefinition,
  type GpsMultiunitGeofenceResult,
  summarizeGpsMultiunitGeofenceResults,
} from "./mod.ts";

const geofenceResults: GpsMultiunitGeofenceResult[] = [
  {
    sensorName: "配送トラッカーA",
    imsi: "***********7890",
    status: "inside",
    sampleTime: Date.parse("2026-03-20T00:00:00.000Z"),
    distanceMeters: 12.3,
    latitude: 35,
    longitude: 139,
    deviceIssue: false,
    noData: false,
  },
  {
    sensorName: "配送トラッカーB",
    imsi: "***********7891",
    status: "outside",
    sampleTime: Date.parse("2026-03-20T00:05:00.000Z"),
    distanceMeters: 250.8,
    latitude: 35.002,
    longitude: 139.003,
    deviceIssue: true,
    noData: false,
  },
  {
    sensorName: "配送トラッカーC",
    imsi: "***********7892",
    status: "no_gps",
    sampleTime: Date.parse("2026-03-20T00:10:00.000Z"),
    deviceIssue: false,
    noData: false,
  },
  {
    sensorName: "配送トラッカーD",
    imsi: "***********7893",
    status: "no_gps",
    deviceIssue: false,
    noData: true,
  },
];

Deno.test({
  name: "ジオフェンス結果をinside/outside/no_gpsで集計できる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const summary = summarizeGpsMultiunitGeofenceResults(geofenceResults);

    assertEquals(summary.insideCount, 1);
    assertEquals(summary.outsideCount, 1);
    assertEquals(summary.noGpsCount, 2);
    assertEquals(summary.hasOutside, true);
  },
});

Deno.test({
  name: "ジオフェンス集約メッセージに距離と地図URLと警告文が含まれる",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const message = formatGpsMultiunitGeofenceReportMessage(
      "group-1",
      "1h",
      35,
      139,
      100,
      geofenceResults,
      1,
    );

    assertEquals(message.includes("group-1"), true);
    assertEquals(message.includes("内側 1台"), true);
    assertEquals(message.includes("外側 1台"), true);
    assertEquals(message.includes("GPS未取得 2台"), true);
    assertEquals(message.includes("google.com/maps/search"), true);
    assertEquals(message.includes("12.3"), true);
    assertEquals(message.includes("250.8"), true);
    assertEquals(message.includes("GPS未取得"), true);
    assertEquals(
      message.includes("対応: *想定範囲内です。追加対応は不要です。*"),
      true,
    );
    assertEquals(
      message.includes(
        "対応: *想定範囲外です。地図で現在地を確認し、予定外の移動であれば担当者または現地へ確認してください。*",
      ),
      true,
    );
    assertEquals(
      message.includes(
        "対応: *位置情報を取得できません。通信状態、電源、送信設定を確認してください。*",
      ),
      true,
    );
    assertEquals(
      message.includes("期間内のサンプルが見つかりませんでした"),
      true,
    );
    assertEquals(
      message.includes(
        "対応: *期間内データがありません。通信状態、電源、送信間隔を確認してください。*",
      ),
      true,
    );
    assertEquals(
      message.includes("デバイスが一時的な問題を報告しました"),
      true,
    );
  },
});

Deno.test({
  name: "ジオフェンス確認は必要な入力と出力を持つ",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const definition = GpsMultiunitGeofenceReportFunctionDefinition
      .definition as {
        input_parameters?: {
          required?: string[];
          properties?: {
            period?: {
              enum?: string[];
              default?: string;
            };
          };
        };
        output_parameters?: {
          properties?: {
            failed_count?: {
              title?: string;
            };
            has_outside?: {
              title?: string;
            };
            no_gps_count?: {
              title?: string;
            };
          };
          required?: string[];
        };
      };

    assertEquals(
      definition.input_parameters?.required,
      [
        "sim_group_id",
        "channel_id",
        "period",
        "center_latitude",
        "center_longitude",
        "radius_meters",
      ],
    );
    assertEquals(
      definition.input_parameters?.properties?.period?.enum,
      ["1h", "1d"],
    );
    assertEquals(
      definition.input_parameters?.properties?.period?.default,
      "1h",
    );
    assertEquals(
      definition.output_parameters?.required?.includes("has_outside"),
      true,
    );
    assertEquals(
      definition.output_parameters?.required?.includes("no_gps_count"),
      true,
    );
    assertEquals(
      definition.output_parameters?.properties?.has_outside?.title,
      "範囲外あり",
    );
    assertEquals(
      definition.output_parameters?.properties?.no_gps_count?.title,
      "GPS未取得SIM数",
    );
    assertEquals(
      definition.output_parameters?.properties?.failed_count?.title,
      "取得失敗件数",
    );
  },
});
