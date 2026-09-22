import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NETWORK_ERROR_MESSAGE, isAbortError } from './client';
import { uploadDocument } from './documents';

// Just enough of XMLHttpRequest for the code under test, with hooks to drive it.
class FakeXhr {
  static last: FakeXhr;
  method = '';
  url = '';
  responseType = '';
  status = 0;
  response: unknown = null;
  body: FormData | null = null;
  aborted = false;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  send(body: FormData) {
    this.body = body;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  respond(status: number, response: unknown = null) {
    this.status = status;
    this.response = response;
    this.onload?.();
  }
}

const file = new File(['%PDF-1.4'], 'invoice.pdf', { type: 'application/pdf' });

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected the upload to fail');
    },
    (error: unknown) => error,
  );
}

describe('uploadDocument', () => {
  beforeEach(() => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the file as multipart form data under the "file" field', () => {
    uploadDocument(file, () => {});

    expect(FakeXhr.last.method).toBe('POST');
    expect(FakeXhr.last.url).toMatch(/\/documents\/upload$/);
    expect(FakeXhr.last.body?.get('file')).toBe(file);
  });

  it('reports upload progress as a fraction', () => {
    const onProgress = vi.fn();
    uploadDocument(file, onProgress);

    FakeXhr.last.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 } as ProgressEvent);
    FakeXhr.last.upload.onprogress?.({ lengthComputable: false, loaded: 50, total: 0 } as ProgressEvent);

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(0.25);
  });

  it('resolves with the created document on success', async () => {
    const { result } = uploadDocument(file, () => {});
    const created = { id: 'doc-1', filename: 'invoice.pdf', status: 'PENDING' };

    FakeXhr.last.respond(201, created);

    await expect(result).resolves.toEqual(created);
  });

  it.each([
    [413, /larger than 10 MB/],
    [429, /Too many uploads/],
    [422, /couldn't read this file as a PDF/],
    [400, /rejected \(status 400\)/],
    [500, /couldn't accept the upload/],
    [503, /couldn't accept the upload/],
  ])('explains a %i response in plain language', async (status, message) => {
    const { result } = uploadDocument(file, () => {});

    FakeXhr.last.respond(status, { message: 'internal detail that should not be shown' });

    const error = await failureOf(result);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(status);
    expect((error as ApiError).message).toMatch(message);
    expect((error as ApiError).message).not.toContain('internal detail');
  });

  it('reports an unreachable server', async () => {
    const { result } = uploadDocument(file, () => {});

    FakeXhr.last.onerror?.();

    const error = await failureOf(result);
    expect((error as ApiError).message).toBe(NETWORK_ERROR_MESSAGE);
    expect((error as ApiError).status).toBeNull();
  });

  it('can be cancelled, rejecting with an abort the UI can recognise', async () => {
    const { result, cancel } = uploadDocument(file, () => {});

    cancel();

    expect(FakeXhr.last.aborted).toBe(true);
    expect(isAbortError(await failureOf(result))).toBe(true);
  });
});
