import type { HarvestDataEntry } from "./types.ts";

/** Air quality sample extracted from a Harvest Data entry. */
export type AirQualitySample = {
  time: number;
  co2?: number;
  temperature?: number;
  humidity?: number;
};

/** Summary values for one air quality metric. */
export type AirQualityMetricSummary = {
  latest?: number;
  min?: number;
  max?: number;
  average?: number;
};

/** Aggregated air quality summary for Harvest Data entries. */
export type AirQualitySummary = {
  sampleCount: number;
  co2: AirQualityMetricSummary;
  temperature: AirQualityMetricSummary;
  humidity: AirQualityMetricSummary;
  co2Threshold: number;
  co2ThresholdExceededCount: number;
};

/** Aggregated air quality summary for one fixed time bucket. */
export type AirQualityBucketSummary = {
  startTime: number;
  endTime: number;
  summary: AirQualitySummary;
};

/** Before/after comparison for one air quality metric average. */
export type AirQualityMetricDelta = {
  before?: number;
  after?: number;
  delta?: number;
};

/** Before/after comparison for air quality summary averages. */
export type AirQualitySummaryDelta = {
  co2: AirQualityMetricDelta;
  temperature: AirQualityMetricDelta;
  humidity: AirQualityMetricDelta;
};

/** Largest CO2 change between consecutive samples. */
export type AirQualitySpike = {
  previousTime: number;
  currentTime: number;
  previousCo2: number;
  currentCo2: number;
  delta: number;
};

const DEFAULT_CO2_THRESHOLD = 1000;

const AIR_QUALITY_KEYS = {
  co2: ["co2", "co2ppm", "co2_ppm"],
  temperature: ["temperature", "temp"],
  humidity: ["humidity", "hum"],
} as const;

/**
 * Extracts an air quality sample from a Harvest Data entry.
 *
 * Returns `null` when the entry has no supported numeric metrics.
 *
 * @param entry - Harvest Data entry
 * @returns Extracted air quality sample or `null`
 */
export function extractAirQualitySample(
  entry: HarvestDataEntry,
): AirQualitySample | null {
  if (!Number.isFinite(entry.time) || !isRecord(entry.content)) {
    return null;
  }

  const content = createCaseInsensitiveContentMap(entry.content);
  const sample: AirQualitySample = {
    time: entry.time,
    co2: getAliasedNumericValue(content, AIR_QUALITY_KEYS.co2),
    temperature: getAliasedNumericValue(content, AIR_QUALITY_KEYS.temperature),
    humidity: getAliasedNumericValue(content, AIR_QUALITY_KEYS.humidity),
  };

  if (
    sample.co2 === undefined &&
    sample.temperature === undefined &&
    sample.humidity === undefined
  ) {
    return null;
  }

  return sample;
}

/**
 * Summarizes extracted air quality samples from Harvest Data entries.
 *
 * Invalid entries and entries without supported metrics are ignored.
 *
 * @param entries - Harvest Data entries
 * @param co2Threshold - Threshold used for CO2 exceedance counting
 * @returns Aggregated air quality summary
 */
export function summarizeAirQualityEntries(
  entries: HarvestDataEntry[],
  co2Threshold = DEFAULT_CO2_THRESHOLD,
): AirQualitySummary {
  return summarizeAirQualitySamples(
    entries
      .map((entry) => extractAirQualitySample(entry))
      .filter((sample): sample is AirQualitySample => sample !== null),
    co2Threshold,
  );
}

/**
 * Filters Harvest Data entries to the half-open time range `[startTime, endTime)`.
 *
 * Entries with non-finite timestamps are ignored.
 *
 * @param entries - Harvest Data entries
 * @param startTime - Inclusive range start in milliseconds
 * @param endTime - Exclusive range end in milliseconds
 * @returns Filtered entries within the requested time range
 */
export function filterAirQualityEntriesByTimeRange(
  entries: HarvestDataEntry[],
  startTime: number,
  endTime: number,
): HarvestDataEntry[] {
  if (
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    endTime < startTime
  ) {
    return [];
  }

  return entries.filter((entry) =>
    Number.isFinite(entry.time) &&
    entry.time >= startTime &&
    entry.time < endTime
  );
}

/**
 * Groups extracted air quality samples into fixed windows and summarizes each bucket.
 *
 * Buckets are aligned to UNIX epoch boundaries using `Math.floor(time / windowSizeMs)`.
 * Invalid entries and entries without supported metrics are ignored.
 *
 * @param entries - Harvest Data entries
 * @param windowSizeMs - Fixed bucket size in milliseconds
 * @param co2Threshold - Threshold used for CO2 exceedance counting
 * @returns Time-ordered bucket summaries
 */
export function bucketAirQualityEntries(
  entries: HarvestDataEntry[],
  windowSizeMs: number,
  co2Threshold = DEFAULT_CO2_THRESHOLD,
): AirQualityBucketSummary[] {
  if (!Number.isFinite(windowSizeMs) || windowSizeMs <= 0) {
    throw new Error("windowSizeMs must be a positive number");
  }

  const buckets = new Map<number, AirQualitySample[]>();

  for (const entry of entries) {
    const sample = extractAirQualitySample(entry);
    if (sample === null) {
      continue;
    }

    const bucketStart = Math.floor(sample.time / windowSizeMs) * windowSizeMs;
    const bucketSamples = buckets.get(bucketStart) ?? [];
    bucketSamples.push(sample);
    buckets.set(bucketStart, bucketSamples);
  }

  return Array.from(buckets.entries())
    .sort(([left], [right]) => left - right)
    .map(([startTime, samples]) => ({
      startTime,
      endTime: startTime + windowSizeMs,
      summary: summarizeAirQualitySamples(samples, co2Threshold),
    }));
}

/**
 * Finds the bucket with the highest CO2 average.
 *
 * Buckets without a CO2 average are ignored. When averages tie, the latest bucket wins.
 *
 * @param buckets - Bucket summaries to inspect
 * @returns Peak CO2 bucket or `null` when no bucket has a CO2 average
 */
export function findPeakCo2Bucket(
  buckets: AirQualityBucketSummary[],
): AirQualityBucketSummary | null {
  let peakBucket: AirQualityBucketSummary | null = null;

  for (const bucket of buckets) {
    const co2Average = bucket.summary.co2.average;
    if (co2Average === undefined) {
      continue;
    }

    if (peakBucket === null) {
      peakBucket = bucket;
      continue;
    }

    const peakAverage = peakBucket.summary.co2.average;
    if (
      peakAverage === undefined ||
      co2Average > peakAverage ||
      (co2Average === peakAverage && bucket.startTime >= peakBucket.startTime)
    ) {
      peakBucket = bucket;
    }
  }

  return peakBucket;
}

/**
 * Compares two summaries using metric averages and returns before/after deltas.
 *
 * @param before - Baseline summary
 * @param after - Summary to compare against the baseline
 * @returns Average-based comparison result
 */
export function compareAirQualitySummaries(
  before: AirQualitySummary,
  after: AirQualitySummary,
): AirQualitySummaryDelta {
  return {
    co2: compareMetricAverages(before.co2, after.co2),
    temperature: compareMetricAverages(before.temperature, after.temperature),
    humidity: compareMetricAverages(before.humidity, after.humidity),
  };
}

/**
 * Finds the largest CO2 change between consecutive samples.
 *
 * Samples without CO2 values are ignored. When magnitudes tie, the latest spike wins.
 *
 * @param entries - Harvest Data entries
 * @returns Largest CO2 spike or `null`
 */
export function findLargestCo2Spike(
  entries: HarvestDataEntry[],
): AirQualitySpike | null {
  const samples = entries
    .map((entry) => extractAirQualitySample(entry))
    .filter((sample): sample is AirQualitySample =>
      sample !== null && sample.co2 !== undefined
    )
    .sort((left, right) => left.time - right.time);

  let largestSpike: AirQualitySpike | null = null;

  for (let index = 1; index < samples.length; index++) {
    const previousSample = samples[index - 1];
    const currentSample = samples[index];
    const spike: AirQualitySpike = {
      previousTime: previousSample.time,
      currentTime: currentSample.time,
      previousCo2: previousSample.co2!,
      currentCo2: currentSample.co2!,
      delta: currentSample.co2! - previousSample.co2!,
    };

    if (largestSpike === null) {
      largestSpike = spike;
      continue;
    }

    const largestMagnitude = Math.abs(largestSpike.delta);
    const currentMagnitude = Math.abs(spike.delta);
    if (
      currentMagnitude > largestMagnitude ||
      (currentMagnitude === largestMagnitude &&
        spike.currentTime >= largestSpike.currentTime)
    ) {
      largestSpike = spike;
    }
  }

  return largestSpike;
}

/**
 * Summarizes extracted air quality samples.
 *
 * @param samples - Extracted air quality samples
 * @param co2Threshold - Threshold used for CO2 exceedance counting
 * @returns Aggregated air quality summary
 */
function summarizeAirQualitySamples(
  samples: AirQualitySample[],
  co2Threshold: number,
): AirQualitySummary {
  const sortedSamples = [...samples].sort((a, b) => a.time - b.time);

  return {
    sampleCount: sortedSamples.length,
    co2: summarizeMetric(sortedSamples, "co2"),
    temperature: summarizeMetric(sortedSamples, "temperature"),
    humidity: summarizeMetric(sortedSamples, "humidity"),
    co2Threshold,
    co2ThresholdExceededCount:
      sortedSamples.filter((sample) =>
        sample.co2 !== undefined && sample.co2 > co2Threshold
      ).length,
  };
}

/**
 * Creates summary values for one metric across samples.
 *
 * @param samples - Extracted air quality samples
 * @param metric - Metric name to summarize
 * @returns Metric summary
 */
function summarizeMetric(
  samples: AirQualitySample[],
  metric: keyof Omit<AirQualitySample, "time">,
): AirQualityMetricSummary {
  const values = samples
    .map((sample) => sample[metric])
    .filter((value): value is number => value !== undefined);

  if (values.length === 0) {
    return {};
  }

  return {
    latest: values[values.length - 1],
    min: Math.min(...values),
    max: Math.max(...values),
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
  };
}

/**
 * Compares metric averages between two summaries.
 *
 * @param before - Baseline metric summary
 * @param after - Metric summary to compare
 * @returns Before/after average values and delta
 */
function compareMetricAverages(
  before: AirQualityMetricSummary,
  after: AirQualityMetricSummary,
): AirQualityMetricDelta {
  const beforeAverage = before.average;
  const afterAverage = after.average;

  return {
    before: beforeAverage,
    after: afterAverage,
    delta: beforeAverage !== undefined && afterAverage !== undefined
      ? afterAverage - beforeAverage
      : undefined,
  };
}

/**
 * Looks up the first finite numeric value for supported aliases.
 *
 * @param content - Lowercase-keyed content map
 * @param aliases - Supported aliases in priority order
 * @returns Numeric value when found
 */
function getAliasedNumericValue(
  content: ReadonlyMap<string, unknown>,
  aliases: readonly string[],
): number | undefined {
  for (const alias of aliases) {
    const value = parseNumericValue(content.get(alias));
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

/**
 * Converts entry content into a lowercase-keyed lookup map.
 *
 * @param content - Harvest Data content object
 * @returns Lowercase-keyed value map
 */
function createCaseInsensitiveContentMap(
  content: Record<string, unknown>,
): ReadonlyMap<string, unknown> {
  return new Map(
    Object.entries(content).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

/**
 * Parses a finite numeric value from unknown content.
 *
 * @param value - Raw metric value
 * @returns Parsed number when valid
 */
function parseNumericValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }
  }

  return undefined;
}

/**
 * Checks whether a value is a plain record.
 *
 * @param value - Value to inspect
 * @returns `true` when the value is a non-null object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
