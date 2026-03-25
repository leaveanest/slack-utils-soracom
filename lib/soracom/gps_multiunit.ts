import type { HarvestDataEntry } from "./types.ts";

/** GPS coordinates extracted from a GPS multiunit sample. */
export type GpsMultiunitLocation = {
  latitude: number;
  longitude: number;
  time: number;
};

/** Parsed GPS multiunit sample from Harvest Data. */
export type GpsMultiunitSample = {
  time: number;
  latitude?: number;
  longitude?: number;
  temperature?: number;
  humidity?: number;
  type?: number;
};

/** Fixed-window summary for GPS multiunit samples. */
export type GpsMultiunitBucketSummary = {
  startTime: number;
  endTime: number;
  sampleCount: number;
  averageTemperature?: number;
  averageHumidity?: number;
  latestSampleTime?: number;
  latestLocation?: GpsMultiunitLocation;
  hasDeviceError: boolean;
};

const GPS_MULTIUNIT_KEYS = {
  latitude: ["lat"],
  longitude: ["lon"],
  temperature: ["temp"],
  humidity: ["humi"],
  type: ["type"],
} as const;

/**
 * Extracts one GPS multiunit sample from a Harvest Data entry.
 *
 * Returns `null` only when the entry has none of the supported GPS multiunit
 * fields.
 *
 * @param entry - Harvest Data entry
 * @returns Parsed sample or `null`
 */
export function extractGpsMultiunitSample(
  entry: HarvestDataEntry,
): GpsMultiunitSample | null {
  if (!Number.isFinite(entry.time)) {
    return null;
  }

  const content = normalizeGpsMultiunitContent(
    entry.content,
    entry.contentType,
  );
  if (!isRecord(content)) {
    return null;
  }

  const normalized = createCaseInsensitiveContentMap(content);
  const hasRelevantField = hasAnyAliasedField(
    normalized,
    Object.values(GPS_MULTIUNIT_KEYS).flat(),
  );

  if (!hasRelevantField) {
    return null;
  }

  const latitude = getAliasedNumericValue(
    normalized,
    GPS_MULTIUNIT_KEYS.latitude,
  );
  const longitude = getAliasedNumericValue(
    normalized,
    GPS_MULTIUNIT_KEYS.longitude,
  );
  const hasValidGps = isValidLatitude(latitude) && isValidLongitude(longitude);
  const type = getAliasedNumericValue(normalized, GPS_MULTIUNIT_KEYS.type);

  return {
    time: entry.time,
    latitude: hasValidGps ? latitude : undefined,
    longitude: hasValidGps ? longitude : undefined,
    temperature: getAliasedNumericValue(
      normalized,
      GPS_MULTIUNIT_KEYS.temperature,
    ),
    humidity: getAliasedNumericValue(normalized, GPS_MULTIUNIT_KEYS.humidity),
    type: type !== undefined ? Math.trunc(type) : undefined,
  };
}

/**
 * Extracts all GPS multiunit samples from Harvest Data entries.
 *
 * @param entries - Harvest Data entries
 * @returns Time-ordered samples
 */
export function extractGpsMultiunitSamples(
  entries: HarvestDataEntry[],
): GpsMultiunitSample[] {
  return entries
    .map((entry) => extractGpsMultiunitSample(entry))
    .filter((sample): sample is GpsMultiunitSample => sample !== null)
    .sort((left, right) => left.time - right.time);
}

/**
 * Finds the newest sample by timestamp.
 *
 * @param samples - GPS multiunit samples
 * @returns Latest sample or `null`
 */
export function findLatestGpsMultiunitSample(
  samples: GpsMultiunitSample[],
): GpsMultiunitSample | null {
  if (samples.length === 0) {
    return null;
  }

  return samples.reduce((latest, current) =>
    current.time > latest.time ? current : latest
  );
}

/**
 * Returns true when the sample has valid GPS coordinates.
 *
 * @param sample - GPS multiunit sample
 * @returns `true` when both latitude and longitude are available
 */
export function hasGpsMultiunitLocation(
  sample: GpsMultiunitSample,
): boolean {
  return sample.latitude !== undefined && sample.longitude !== undefined;
}

/**
 * Returns true when the sample indicates a temporary device issue.
 *
 * @param sample - GPS multiunit sample
 * @returns `true` when `type` equals `-1`
 */
export function isGpsMultiunitDeviceIssue(
  sample: GpsMultiunitSample,
): boolean {
  return sample.type === -1;
}

/**
 * Builds exactly `bucketCount` fixed buckets over the given period.
 *
 * @param startTime - Inclusive range start in milliseconds
 * @param endTime - Inclusive range end in milliseconds
 * @param bucketCount - Number of buckets to create
 * @returns Bucket ranges
 */
export function buildGpsMultiunitBucketRanges(
  startTime: number,
  endTime: number,
  bucketCount: number,
): Array<{ startTime: number; endTime: number }> {
  if (
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    endTime < startTime ||
    !Number.isInteger(bucketCount) ||
    bucketCount <= 0
  ) {
    return [];
  }

  const totalDuration = endTime - startTime;
  return Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = startTime +
      Math.floor((totalDuration * index) / bucketCount);
    const bucketEnd = index === bucketCount - 1
      ? endTime
      : startTime + Math.floor((totalDuration * (index + 1)) / bucketCount);

    return {
      startTime: bucketStart,
      endTime: bucketEnd,
    };
  });
}

/**
 * Summarizes GPS multiunit samples into fixed buckets.
 *
 * Temperature and humidity are averaged within each bucket. GPS output uses the
 * newest valid location within the bucket and never averages coordinates.
 *
 * @param samples - GPS multiunit samples
 * @param startTime - Inclusive period start in milliseconds
 * @param endTime - Inclusive period end in milliseconds
 * @param bucketCount - Number of buckets to produce
 * @returns Bucket summaries in chronological order
 */
export function bucketGpsMultiunitSamples(
  samples: GpsMultiunitSample[],
  startTime: number,
  endTime: number,
  bucketCount: number,
): GpsMultiunitBucketSummary[] {
  const ranges = buildGpsMultiunitBucketRanges(startTime, endTime, bucketCount);
  if (ranges.length === 0) {
    return [];
  }

  const orderedSamples = [...samples].sort((left, right) =>
    left.time - right.time
  );

  return ranges.map((range, index) => {
    const bucketSamples = orderedSamples.filter((sample) =>
      sample.time >= range.startTime &&
      (index === ranges.length - 1
        ? sample.time <= range.endTime
        : sample.time < range.endTime)
    );
    const latestSample = findLatestGpsMultiunitSample(bucketSamples);
    const latestLocationSample = [...bucketSamples].reverse().find((sample) =>
      hasGpsMultiunitLocation(sample)
    );

    return {
      startTime: range.startTime,
      endTime: range.endTime,
      sampleCount: bucketSamples.length,
      averageTemperature: averageDefinedValues(
        bucketSamples.map((sample) => sample.temperature),
      ),
      averageHumidity: averageDefinedValues(
        bucketSamples.map((sample) => sample.humidity),
      ),
      latestSampleTime: latestSample?.time,
      latestLocation: latestLocationSample &&
          latestLocationSample.latitude !== undefined &&
          latestLocationSample.longitude !== undefined
        ? {
          latitude: latestLocationSample.latitude,
          longitude: latestLocationSample.longitude,
          time: latestLocationSample.time,
        }
        : undefined,
      hasDeviceError: bucketSamples.some((sample) =>
        isGpsMultiunitDeviceIssue(sample)
      ),
    };
  });
}

/**
 * Builds a Google Maps search URL for the given coordinates.
 *
 * @param latitude - Latitude
 * @param longitude - Longitude
 * @returns Google Maps URL
 */
export function buildGpsMultiunitGoogleMapsUrl(
  latitude: number,
  longitude: number,
): string {
  const params = new URLSearchParams({
    api: "1",
    query: `${latitude},${longitude}`,
  });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

/**
 * Calculates great-circle distance using the Haversine formula.
 *
 * @param latitude - Source latitude
 * @param longitude - Source longitude
 * @param centerLatitude - Destination latitude
 * @param centerLongitude - Destination longitude
 * @returns Distance in meters
 */
export function calculateGpsMultiunitDistanceMeters(
  latitude: number,
  longitude: number,
  centerLatitude: number,
  centerLongitude: number,
): number {
  const earthRadiusMeters = 6371000;
  const latitudeRadians = toRadians(latitude);
  const centerLatitudeRadians = toRadians(centerLatitude);
  const deltaLatitude = toRadians(centerLatitude - latitude);
  const deltaLongitude = toRadians(centerLongitude - longitude);
  const a = Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeRadians) * Math.cos(centerLatitudeRadians) *
      Math.sin(deltaLongitude / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

/**
 * Determines whether a point is inside a geofence. The boundary is inclusive.
 *
 * @param latitude - Point latitude
 * @param longitude - Point longitude
 * @param centerLatitude - Geofence center latitude
 * @param centerLongitude - Geofence center longitude
 * @param radiusMeters - Geofence radius in meters
 * @returns `true` when the point is inside or on the boundary
 */
export function isGpsMultiunitWithinGeofence(
  latitude: number,
  longitude: number,
  centerLatitude: number,
  centerLongitude: number,
  radiusMeters: number,
): boolean {
  return calculateGpsMultiunitDistanceMeters(
    latitude,
    longitude,
    centerLatitude,
    centerLongitude,
  ) <= radiusMeters;
}

function averageDefinedValues(
  values: Array<number | undefined>,
): number | undefined {
  const definedValues = values.filter((value): value is number =>
    value !== undefined
  );

  if (definedValues.length === 0) {
    return undefined;
  }

  const total = definedValues.reduce((sum, value) => sum + value, 0);
  return total / definedValues.length;
}

function normalizeGpsMultiunitContent(
  content: unknown,
  contentType: string,
): unknown {
  if (
    typeof content === "string" &&
    contentType.toLowerCase().includes("application/json")
  ) {
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }

  return content;
}

function createCaseInsensitiveContentMap(
  content: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(content).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

function getAliasedNumericValue(
  content: Record<string, unknown>,
  aliases: readonly string[],
): number | undefined {
  for (const alias of aliases) {
    const value = parseFiniteNumber(content[alias.toLowerCase()]);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function hasAnyAliasedField(
  content: Record<string, unknown>,
  aliases: readonly string[],
): boolean {
  return aliases.some((alias) => Object.hasOwn(content, alias.toLowerCase()));
}

function parseFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function isValidLatitude(value: number | undefined): value is number {
  return value !== undefined && value >= -90 && value <= 90;
}

function isValidLongitude(value: number | undefined): value is number {
  return value !== undefined && value >= -180 && value <= 180;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}
