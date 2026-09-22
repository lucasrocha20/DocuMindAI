import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useApi } from './useApi';

// A promise the test settles by hand, to control the order responses arrive in.
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useApi', () => {
  it('starts loading, then exposes the data', async () => {
    const { result } = renderHook(() => useApi(() => Promise.resolve('hello'), 'k'));

    expect(result.current).toMatchObject({ data: null, error: null, loading: true });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ data: 'hello', error: null });
  });

  it('exposes a failure as an error with no data', async () => {
    const { result } = renderHook(() => useApi(() => Promise.reject(new Error('boom')), 'k'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.message).toBe('boom');
    expect(result.current.data).toBeNull();
  });

  it('never shows data that belongs to a previous key', async () => {
    const { result, rerender } = renderHook(
      ({ id }) => useApi(() => Promise.resolve(`invoice ${id}`), `invoice|${id}`),
      { initialProps: { id: 'a' } },
    );
    await waitFor(() => expect(result.current.data).toBe('invoice a'));
    const pending = deferred<string>();

    rerender({ id: 'b' });
    // Immediately after the switch: the old invoice must not be shown as the new one.
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
    pending.resolve('unused');
    await waitFor(() => expect(result.current.data).toBe('invoice b'));
  });

  it('ignores a slow response for a key the caller has already moved on from', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const responses: Record<string, Promise<string>> = { a: first.promise, b: second.promise };
    const { result, rerender } = renderHook(({ id }) => useApi(() => responses[id], `k|${id}`), {
      initialProps: { id: 'a' },
    });

    rerender({ id: 'b' });
    await act(async () => {
      second.resolve('answer for b');
    });
    await act(async () => {
      first.resolve('late answer for a');
    });

    expect(result.current.data).toBe('answer for b');
  });

  it('reload refetches and keeps the current data on screen while it does', async () => {
    const next = deferred<string>();
    const fetcher = vi.fn<() => Promise<string>>().mockResolvedValueOnce('v1').mockReturnValueOnce(next.promise);
    const { result } = renderHook(() => useApi(fetcher, 'k'));
    await waitFor(() => expect(result.current.data).toBe('v1'));

    act(() => result.current.reload());

    expect(result.current.data).toBe('v1');
    expect(result.current.loading).toBe(true);
    await act(async () => {
      next.resolve('v2');
    });
    expect(result.current.data).toBe('v2');
    expect(result.current.loading).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps showing stale data when a reload fails, and clears the error on a good retry', async () => {
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('v1')
      .mockRejectedValueOnce(new Error('server blip'))
      .mockResolvedValueOnce('v2');
    const { result } = renderHook(() => useApi(fetcher, 'k'));
    await waitFor(() => expect(result.current.data).toBe('v1'));

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error?.message).toBe('server blip'));
    expect(result.current.data).toBe('v1');

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toBe('v2'));
    expect(result.current.error).toBeNull();
  });

  it('does not report an abort as an error', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    const { result } = renderHook(() => useApi(() => Promise.reject(abort), 'k'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(true);
  });
});
