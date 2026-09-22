import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NETWORK_ERROR_MESSAGE, RATE_LIMITED_MESSAGE, getJson, isAbortError } from './client';

function respond(status: number, body: unknown, { json = true } = {}) {
  return new Response(json ? JSON.stringify(body) : String(body), { status });
}

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected the request to fail');
    },
    (error: unknown) => error,
  );
}

describe('getJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the parsed body on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(200, { ok: true })));

    await expect(getJson('/health')).resolves.toEqual({ ok: true });
  });

  it('turns an error response into an ApiError carrying the status and server message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(404, { message: 'Invoice not found' })));

    const error = await failureOf(getJson('/invoices/x'));

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).message).toBe('Invoice not found');
  });

  it('explains being rate limited in plain language, not with the server\'s wording', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(429, { message: 'ThrottlerException: Too Many Requests' })));

    const error = await failureOf(getJson('/invoices'));

    expect((error as ApiError).status).toBe(429);
    expect((error as ApiError).message).toBe(RATE_LIMITED_MESSAGE);
  });

  it('joins a list of validation messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(400, { message: ['page: too small', 'pageSize: too big'] })));

    const error = await failureOf(getJson('/invoices'));

    expect((error as ApiError).message).toBe('page: too small; pageSize: too big');
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(502, '<html>Bad gateway</html>', { json: false })));

    const error = await failureOf(getJson('/invoices'));

    expect((error as ApiError).message).toBe('The server responded with status 502.');
    expect((error as ApiError).status).toBe(502);
  });

  it('reports an unreachable server as a friendly ApiError with no status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = await failureOf(getJson('/invoices'));

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBeNull();
    expect((error as ApiError).message).toBe(NETWORK_ERROR_MESSAGE);
  });

  it('lets an abort through untouched, so callers can ignore it', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));

    const error = await failureOf(getJson('/invoices', new AbortController().signal));

    expect(error).toBe(abort);
    expect(isAbortError(error)).toBe(true);
    expect(isAbortError(new ApiError('x', null))).toBe(false);
  });
});
