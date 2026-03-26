/**
 * Runtime environment access helpers.
 *
 * Slack managed functions may not permit arbitrary env access. This helper
 * converts capability errors into `undefined` so callers can decide whether to
 * fall back or raise an application-level error.
 */

/** Environment reader signature used for testing. */
export type EnvReader = (name: string) => string | undefined;
/** Runtime-provided environment variables. */
export type EnvVars = Record<string, string | undefined>;

function isEnvAccessUnavailable(error: unknown): boolean {
  return error instanceof Error && error.name === "NotCapable";
}

/**
 * Read an environment variable when runtime permissions allow it.
 *
 * @param name - Environment variable name
 * @param reader - Optional env reader override for tests
 * @returns The environment variable value, or `undefined` when unavailable
 * @throws Rethrows unexpected errors from the reader
 */
export function getOptionalEnv(
  name: string,
  reader: EnvReader = (key) => Deno.env.get(key),
): string | undefined {
  try {
    return reader(name);
  } catch (error) {
    if (isEnvAccessUnavailable(error)) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Read an environment variable from runtime context first, then fall back to
 * direct environment access when available.
 *
 * @param name - Environment variable name
 * @param env - Runtime-provided environment variable map
 * @param reader - Optional env reader override for tests
 * @returns The environment variable value, or `undefined` when unavailable
 */
export function getRuntimeEnv(
  name: string,
  env?: EnvVars,
  reader?: EnvReader,
): string | undefined {
  if (env && env[name] !== undefined) {
    return env[name];
  }

  return getOptionalEnv(name, reader);
}
