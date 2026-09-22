import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';

const development = {
  DATABASE_URL: 'postgresql://documind:documind@localhost:5432/documind',
  OPENAI_API_KEY: 'local-dev-placeholder-key',
};

const production = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:Xk29-long-random-secret@db.internal:5432/documind?sslmode=require',
  OPENAI_API_KEY: 'sk-real-looking-key',
  CORS_ORIGIN: 'https://app.example.com',
};

function messageOf(config: Record<string, unknown>): string {
  try {
    validateEnv(config);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected validation to fail');
}

describe('validateEnv', () => {
  it('accepts a development configuration, placeholders included', () => {
    expect(validateEnv(development)).toBe(development);
  });

  it('accepts a properly configured production environment', () => {
    expect(() => validateEnv(production)).not.toThrow();
  });

  it('keeps unrelated variables untouched', () => {
    expect(validateEnv({ ...development, PATH: '/usr/bin', ANYTHING: 'else' })).toMatchObject({ ANYTHING: 'else' });
  });

  describe('always requires', () => {
    it.each(['DATABASE_URL', 'OPENAI_API_KEY'])('%s, missing or empty', (name) => {
      const { [name]: _removed, ...missing } = development as Record<string, string>;

      expect(messageOf(missing)).toContain(name);
      expect(messageOf({ ...development, [name]: '' })).toContain(name);
    });

    it.each(['abc', '-1', '1.5'])('a sensible TRUST_PROXY (rejects %j)', (value) => {
      expect(messageOf({ ...development, TRUST_PROXY: value })).toContain('TRUST_PROXY');
    });

    it('and accepts a proxy count', () => {
      expect(() => validateEnv({ ...development, TRUST_PROXY: '1' })).not.toThrow();
    });
  });

  describe('in production refuses', () => {
    it.each(['your-openai-api-key', 'local-dev-placeholder-key', 'changeme'])('the placeholder API key %j', (key) => {
      expect(messageOf({ ...production, OPENAI_API_KEY: key })).toContain('OPENAI_API_KEY is still a placeholder');
    });

    it.each(['documind', 'postgres', 'password'])('a database password of %j', (password) => {
      const databaseUrl = `postgresql://app:${password}@db.internal:5432/documind`;

      expect(messageOf({ ...production, DATABASE_URL: databaseUrl })).toContain('default development password');
    });

    it('a missing CORS_ORIGIN, which would silently fall back to the local dev origin', () => {
      const { CORS_ORIGIN: _removed, ...withoutCors } = production;

      expect(messageOf(withoutCors)).toContain('CORS_ORIGIN must be set');
    });

    it('and reports every problem at once', () => {
      const message = messageOf({ NODE_ENV: 'production', DATABASE_URL: development.DATABASE_URL, OPENAI_API_KEY: 'changeme' });

      expect(message).toContain('placeholder');
      expect(message).toContain('default development password');
      expect(message).toContain('CORS_ORIGIN');
    });
  });

  it('never repeats a secret value in the error', () => {
    const message = messageOf({ ...production, DATABASE_URL: 'postgresql://app:postgres@db.internal/x', OPENAI_API_KEY: 'changeme' });

    expect(message).not.toContain('postgres@');
    expect(message).not.toContain('db.internal');
  });
});
