/**
 * Single logging entry point for the app. Nothing else should call
 * `console.*` directly — routing every call site through here means
 * wiring in a real crash/analytics backend (Sentry, etc.) later is a
 * one-file change instead of a repo-wide find-and-replace.
 *
 * No remote reporting is wired up yet (no crash-reporting service is
 * configured for this app) — today this only writes to the console, scoped
 * by a short area tag so logs are greppable. `logger.error` is the one to
 * swap for `Sentry.captureException`-style reporting first.
 */
export interface Logger {
  debug(area: string, message: string, data?: unknown): void
  info(area: string, message: string, data?: unknown): void
  warn(area: string, message: string, data?: unknown): void
  error(area: string, message: string, error?: unknown): void
}

function format(area: string, message: string): string {
  return `[${area}] ${message}`
}

export const logger: Logger = {
  debug(area, message, data) {
    if (__DEV__) {
      console.debug(format(area, message), data ?? '')
    }
  },
  info(area, message, data) {
    console.info(format(area, message), data ?? '')
  },
  warn(area, message, data) {
    console.warn(format(area, message), data ?? '')
  },
  error(area, message, error) {
    console.error(format(area, message), error ?? '')
  },
}
