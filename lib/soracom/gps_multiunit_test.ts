import { assertEquals } from "std/testing/asserts.ts";
import type { HarvestDataEntry } from "./types.ts";
import {
  bucketGpsMultiunitSamples,
  buildGpsMultiunitBucketRanges,
  buildGpsMultiunitGoogleMapsUrl,
  calculateGpsMultiunitDistanceMeters,
  extractGpsMultiunitSample,
  extractGpsMultiunitSamples,
  findLatestGpsMultiunitSample,
  isGpsMultiunitDeviceIssue,
  isGpsMultiunitWithinGeofence,
} from "./gps_multiunit.ts";

function createEntry(
  time: number,
  content: Record<string, unknown> | string,
): HarvestDataEntry {
  return {
    time,
    content,
    contentType: "application/json",
  };
}

Deno.test("GPSマルチユニットのオブジェクト形式データを抽出できる", () => {
  const sample = extractGpsMultiunitSample(
    createEntry(1700000000000, {
      lat: 35.1,
      lon: 139.2,
      temp: 21.5,
      humi: 43.2,
      type: 0,
    }),
  );

  assertEquals(sample, {
    time: 1700000000000,
    latitude: 35.1,
    longitude: 139.2,
    temperature: 21.5,
    humidity: 43.2,
    type: 0,
  });
});

Deno.test("GPSマルチユニットのJSON文字列データを抽出できる", () => {
  const sample = extractGpsMultiunitSample(
    createEntry(
      1700003600000,
      '{"lat":"35.2","lon":"139.3","temp":"22.0","humi":46,"type":"1"}',
    ),
  );

  assertEquals(sample, {
    time: 1700003600000,
    latitude: 35.2,
    longitude: 139.3,
    temperature: 22,
    humidity: 46,
    type: 1,
  });
});

Deno.test("緯度経度がnullや範囲外ならGPS未取得として扱う", () => {
  const nullGps = extractGpsMultiunitSample(
    createEntry(1700000000000, { lat: null, lon: null, temp: 20 }),
  );
  const outOfRangeGps = extractGpsMultiunitSample(
    createEntry(1700000001000, { lat: 95, lon: 139, humi: 40 }),
  );

  assertEquals(nullGps?.latitude, undefined);
  assertEquals(nullGps?.longitude, undefined);
  assertEquals(nullGps?.temperature, 20);
  assertEquals(outOfRangeGps?.latitude, undefined);
  assertEquals(outOfRangeGps?.longitude, undefined);
  assertEquals(outOfRangeGps?.humidity, 40);
});

Deno.test("typeが-1ならデバイス異常サンプルとして判定できる", () => {
  const sample = extractGpsMultiunitSample(
    createEntry(1700000000000, { lat: 35, lon: 139, type: -1 }),
  );

  assertEquals(sample !== null && isGpsMultiunitDeviceIssue(sample), true);
});

Deno.test("GPSマルチユニットサンプルを時系列順に抽出し最新を選べる", () => {
  const samples = extractGpsMultiunitSamples([
    createEntry(3000, { lat: 35.3, lon: 139.3, temp: 24 }),
    createEntry(1000, { lat: 35.1, lon: 139.1, temp: 22 }),
    createEntry(2000, { lat: 35.2, lon: 139.2, temp: 23 }),
  ]);

  assertEquals(samples.map((sample) => sample.time), [1000, 2000, 3000]);
  assertEquals(findLatestGpsMultiunitSample(samples)?.time, 3000);
});

Deno.test("期間を等分したバケットごとに平均と最新GPSを集計できる", () => {
  const buckets = bucketGpsMultiunitSamples(
    extractGpsMultiunitSamples([
      createEntry(1000, { lat: 35.0, lon: 139.0, temp: 20, humi: 40 }),
      createEntry(2000, {
        lat: 35.1,
        lon: 139.1,
        temp: 22,
        humi: 44,
        type: -1,
      }),
      createEntry(7000, { lat: 35.2, lon: 139.2, temp: 24, humi: 48 }),
    ]),
    0,
    9000,
    3,
  );

  assertEquals(
    buckets.map((bucket) => ({
      sampleCount: bucket.sampleCount,
      averageTemperature: bucket.averageTemperature,
      averageHumidity: bucket.averageHumidity,
      latestLocation: bucket.latestLocation,
      hasDeviceError: bucket.hasDeviceError,
    })),
    [
      {
        sampleCount: 2,
        averageTemperature: 21,
        averageHumidity: 42,
        latestLocation: {
          latitude: 35.1,
          longitude: 139.1,
          time: 2000,
        },
        hasDeviceError: true,
      },
      {
        sampleCount: 0,
        averageTemperature: undefined,
        averageHumidity: undefined,
        latestLocation: undefined,
        hasDeviceError: false,
      },
      {
        sampleCount: 1,
        averageTemperature: 24,
        averageHumidity: 48,
        latestLocation: {
          latitude: 35.2,
          longitude: 139.2,
          time: 7000,
        },
        hasDeviceError: false,
      },
    ],
  );
});

Deno.test("空バケットを含めて要求件数ぶんの時間範囲を生成する", () => {
  const ranges = buildGpsMultiunitBucketRanges(0, 60000, 4);

  assertEquals(ranges.length, 4);
  assertEquals(ranges[0], { startTime: 0, endTime: 15000 });
  assertEquals(ranges[3], { startTime: 45000, endTime: 60000 });
});

Deno.test("Google Maps URLを生成できる", () => {
  assertEquals(
    buildGpsMultiunitGoogleMapsUrl(35, 139),
    "https://www.google.com/maps/search/?api=1&query=35%2C139",
  );
});

Deno.test("ジオフェンス判定は境界上を内側として扱う", () => {
  const centerLatitude = 35;
  const centerLongitude = 139;
  const pointLatitude = 35.001;
  const pointLongitude = 139;
  const radiusMeters = calculateGpsMultiunitDistanceMeters(
    pointLatitude,
    pointLongitude,
    centerLatitude,
    centerLongitude,
  );

  assertEquals(
    isGpsMultiunitWithinGeofence(
      pointLatitude,
      pointLongitude,
      centerLatitude,
      centerLongitude,
      radiusMeters,
    ),
    true,
  );
});
