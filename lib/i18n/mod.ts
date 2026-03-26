/**
 * I18n (Internationalization) utility for multi-language support
 *
 * This module provides functions to load and access localized messages
 * in English and Japanese.
 */

import { getOptionalEnv } from "../env.ts";
import enLocale from "../../locales/en.json" with { type: "json" };
import jaLocale from "../../locales/ja.json" with { type: "json" };

type LocaleData = Record<string, unknown>;

export const SUPPORTED_LOCALES = ["en", "ja"] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];
const DEFAULT_LOCALE: SupportedLocale = "ja";
const JAPAN_TIME_ZONE = "Asia/Tokyo";

let currentLocale: SupportedLocale = DEFAULT_LOCALE;
const localeCache: Map<string, LocaleData> = new Map();

const BUNDLED_LOCALES: Record<SupportedLocale, LocaleData> = {
  en: enLocale as LocaleData,
  ja: jaLocale as LocaleData,
};

/**
 * Load locale data from JSON file
 *
 * @param lang - Language code (e.g., "en", "ja")
 * @returns Locale data object
 * @throws {Error} If locale file cannot be loaded
 */
export async function loadLocale(lang: string): Promise<LocaleData> {
  if (localeCache.has(lang)) {
    return localeCache.get(lang)!;
  }

  const bundledLocale = BUNDLED_LOCALES[lang as SupportedLocale];
  if (bundledLocale) {
    localeCache.set(lang, bundledLocale);
    return bundledLocale;
  }

  if (lang !== "en") {
    console.warn(`Failed to load locale ${lang}, falling back to English`);
    return await loadLocale("en");
  }

  throw new Error(`Failed to load locale: ${lang}`);
}

/**
 * Set the current locale
 *
 * @param lang - Language code (e.g., "en", "ja")
 */
export function setLocale(lang: SupportedLocale): void {
  currentLocale = lang;
}

/**
 * Get the current locale
 *
 * @returns Current language code
 */
export function getLocale(): string {
  return currentLocale;
}

function toSupportedLocale(locale?: string): SupportedLocale {
  return normalizeLocale(locale) ?? currentLocale;
}

function formatDateTimeParts(
  date: Date,
  locale: string,
  timeZone: string,
): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

/**
 * 現在のロケールに応じて日時を整形します。
 *
 * 日本語ロケールでは日本時間で表示し、それ以外は ISO 8601 形式を返します。
 *
 * @param value - 整形対象の日時
 * @param locale - 明示的に指定するロケール
 * @returns 整形済み日時文字列
 */
export function formatLocalizedDateTime(
  value: Date | number | string,
  locale?: SupportedLocale,
): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value: ${value}`);
  }

  const resolvedLocale = toSupportedLocale(locale);
  if (resolvedLocale === "ja") {
    return `${formatDateTimeParts(date, "ja-JP", JAPAN_TIME_ZONE)} JST`;
  }

  return date.toISOString();
}

/**
 * Detect locale from environment variables
 *
 * Checks LOCALE first, then LANG, and defaults to Japanese.
 *
 * @returns Detected locale code
 */
export function detectLocale(): SupportedLocale {
  const explicitLocale = normalizeLocale(getOptionalEnv("LOCALE"));
  if (explicitLocale) {
    return explicitLocale;
  }

  // Respect LANG for Japanese environments, otherwise keep the repo default.
  const langLocale = normalizeLocale(getOptionalEnv("LANG"));
  if (langLocale === "ja") {
    return "ja";
  }

  return DEFAULT_LOCALE;
}

/**
 * Normalize a locale string to a supported language code.
 *
 * @param locale - Raw locale string (e.g., "ja_JP.UTF-8")
 * @returns Supported locale, or undefined if unsupported
 */
function normalizeLocale(locale?: string): SupportedLocale | undefined {
  if (!locale) {
    return undefined;
  }

  const langCode = locale.split(/[-_.]/)[0].toLowerCase();
  return SUPPORTED_LOCALES.includes(langCode as SupportedLocale)
    ? langCode as SupportedLocale
    : undefined;
}

/**
 * Get nested value from object using dot notation
 *
 * @param obj - Object to search
 * @param path - Dot-separated path (e.g., "errors.channel_not_found")
 * @returns Value at path, or undefined if not found
 */
function getNestedValue(obj: LocaleData, path: string): string | undefined {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (
      current === null || current === undefined ||
      typeof current !== "object"
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" ? current : undefined;
}

/**
 * Replace placeholders in a string with values
 *
 * @param template - Template string with placeholders (e.g., "Hello {name}")
 * @param params - Object with placeholder values
 * @returns String with placeholders replaced
 */
function replacePlaceholders(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = params[key];
    return value !== undefined ? String(value) : `{${key}}`;
  });
}

/**
 * Translate a message key to the current locale
 *
 * @param key - Message key in dot notation (e.g., "errors.channel_not_found")
 * @param params - Optional parameters to replace placeholders
 * @returns Translated message with placeholders replaced
 *
 * @example
 * ```typescript
 * // Simple translation
 * t("errors.unknown_error") // => "An unexpected error occurred"
 *
 * // With parameters
 * t("errors.channel_not_found", { error: "not_found" })
 * // => "Failed to load channel info: not_found"
 * ```
 */
export function t(
  key: string,
  params?: Record<string, string | number>,
): string {
  const localeData = localeCache.get(currentLocale);

  if (!localeData) {
    console.warn(`Locale ${currentLocale} not loaded, using key as fallback`);
    return replacePlaceholders(key, params);
  }

  const message = getNestedValue(localeData, key);

  if (!message) {
    // Try fallback to English
    if (currentLocale !== "en") {
      const enData = localeCache.get("en");
      if (enData) {
        const enMessage = getNestedValue(enData, key);
        if (enMessage) {
          return replacePlaceholders(enMessage, params);
        }
      }
    }

    console.warn(`Translation key not found: ${key}`);
    return replacePlaceholders(key, params);
  }

  return replacePlaceholders(message, params);
}

/**
 * Initialize i18n system
 *
 * Detects locale and loads the appropriate locale file
 *
 * @returns Promise that resolves when locale is loaded
 */
export async function initI18n(): Promise<void> {
  const locale = detectLocale();
  setLocale(locale);

  // Load both English (fallback) and current locale
  await loadLocale("en");
  if (locale !== "en") {
    await loadLocale(locale);
  }
}

// Auto-initialize if running in Deno
if (typeof Deno !== "undefined") {
  // Initialize on first import
  initI18n().catch((error) => {
    console.error("Failed to initialize i18n:", error);
  });
}
