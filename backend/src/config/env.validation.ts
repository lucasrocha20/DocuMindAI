import { z } from 'zod';

const PLACEHOLDER_API_KEYS = ['your-openai-api-key', 'local-dev-placeholder-key', 'changeme'];
const DEFAULT_DATABASE_PASSWORDS = ['documind', 'postgres', 'password'];

const envSchema = z.looseObject({
  NODE_ENV: z.string().optional(),
  DATABASE_URL: z.string().min(1, 'is required'),
  OPENAI_API_KEY: z.string().min(1, 'is required'),
  CORS_ORIGIN: z.string().optional(),
  // Number of reverse proxies in front of the app, for correct client IPs.
  TRUST_PROXY: z.coerce.number().int().min(0).optional(),
});

function databasePasswordIsDefault(databaseUrl: string): boolean {
  try {
    return DEFAULT_DATABASE_PASSWORDS.includes(decodeURIComponent(new URL(databaseUrl).password));
  } catch {
    return false;
  }
}

/**
 * Fails the boot, with a message naming the variable (never its value), instead
 * of starting with a configuration that is missing or unsafe for production.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const parsed = envSchema.safeParse(config);
  const problems = parsed.success
    ? []
    : parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`);

  if (parsed.success && parsed.data.NODE_ENV === 'production') {
    if (PLACEHOLDER_API_KEYS.includes(parsed.data.OPENAI_API_KEY)) {
      problems.push('OPENAI_API_KEY is still a placeholder');
    }
    if (databasePasswordIsDefault(parsed.data.DATABASE_URL)) {
      problems.push('DATABASE_URL uses a default development password');
    }
    if (!parsed.data.CORS_ORIGIN) {
      problems.push('CORS_ORIGIN must be set (it otherwise falls back to the local development origin)');
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${problems.join('\n- ')}`);
  }
  return config;
}
