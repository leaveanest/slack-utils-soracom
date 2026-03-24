export type RetryDelayFn = (ms: number) => Promise<void>;

const SHORT_IMMEDIATE_RETRY_DELAYS_MS = [100, 300] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 一時的な失敗だけを短時間で再試行します。
 *
 * @param operation - 再試行対象の処理
 * @param shouldRetry - リトライ可否を判定する関数
 * @param delayFn - 待機関数
 * @returns 処理結果
 */
export async function runWithImmediateRetry<T>(
  operation: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  delayFn: RetryDelayFn = sleep,
): Promise<T> {
  let lastError: unknown;

  for (
    let attempt = 0;
    attempt <= SHORT_IMMEDIATE_RETRY_DELAYS_MS.length;
    attempt++
  ) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (
        attempt === SHORT_IMMEDIATE_RETRY_DELAYS_MS.length ||
        !shouldRetry(error)
      ) {
        throw error;
      }

      await delayFn(SHORT_IMMEDIATE_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
