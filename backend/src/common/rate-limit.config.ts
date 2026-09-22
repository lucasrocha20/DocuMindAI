// Read at request time (throttler accepts functions), so limits follow the
// environment and tests can lower them without rebuilding the app.
function positiveIntFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export const throttleTtlMs = () => positiveIntFromEnv('THROTTLE_TTL_MS', 60_000);

// Per client IP, per route, within the window above.
export const throttleLimit = () => positiveIntFromEnv('THROTTLE_LIMIT', 300);

// Each accepted upload triggers a paid LLM call, so it gets a much tighter limit.
export const uploadRateLimit = () => positiveIntFromEnv('UPLOAD_RATE_LIMIT', 10);
