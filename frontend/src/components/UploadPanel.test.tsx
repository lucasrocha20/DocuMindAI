import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { uploadDocument } from '../api/documents';
import type { UploadedDocument } from '../api/types';
import { UploadPanel } from './UploadPanel';

vi.mock('../api/documents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/documents')>()),
  uploadDocument: vi.fn(),
}));

const createdDocument: UploadedDocument = {
  id: 'doc-1',
  filename: 'invoice.pdf',
  status: 'PENDING',
  errorMessage: null,
  invoiceId: null,
  createdAt: '2026-09-20T12:00:00.000Z',
  updatedAt: '2026-09-20T12:00:00.000Z',
};

// Drives a fake upload: the test decides when progress arrives and how it ends.
function controlUpload() {
  let reportProgress: (fraction: number) => void = () => {};
  let succeed: (document: UploadedDocument) => void = () => {};
  let fail: (reason: unknown) => void = () => {};
  const cancel = vi.fn(() => fail(new DOMException('Upload cancelled', 'AbortError')));
  vi.mocked(uploadDocument).mockImplementation((_file, onProgress) => {
    reportProgress = onProgress;
    const result = new Promise<UploadedDocument>((resolve, reject) => {
      succeed = resolve;
      fail = reject;
    });
    return { result, cancel };
  });
  return {
    cancel,
    progress: (fraction: number) => act(() => reportProgress(fraction)),
    succeed: () => act(async () => succeed(createdDocument)),
    fail: (reason: unknown) => act(async () => fail(reason)),
  };
}

function pdf(name = 'invoice.pdf', type = 'application/pdf') {
  return new File(['%PDF-1.4'], name, { type });
}

function setup() {
  const onUploaded = vi.fn();
  // applyAccept off: dropped files and some file managers bypass the input's accept filter.
  const user = userEvent.setup({ applyAccept: false });
  const { container } = render(<UploadPanel onUploaded={onUploaded} />);
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  return { user, input, onUploaded, dropZone: screen.getByText('Drag a PDF here, or').parentElement! };
}

describe('UploadPanel', () => {
  beforeEach(() => {
    vi.mocked(uploadDocument).mockReset();
  });

  describe('rejects a bad file before anything is sent', () => {
    it('that is not a PDF', async () => {
      const { user, input } = setup();

      await user.upload(input, new File(['hello'], 'notes.txt', { type: 'text/plain' }));

      expect(screen.getByRole('alert').textContent).toContain('"notes.txt" is not a PDF');
      expect(uploadDocument).not.toHaveBeenCalled();
    });

    it('that is empty', async () => {
      const { user, input } = setup();

      await user.upload(input, new File([], 'empty.pdf', { type: 'application/pdf' }));

      expect(screen.getByRole('alert').textContent).toContain('is empty');
      expect(uploadDocument).not.toHaveBeenCalled();
    });

    it('that is over the 10 MB limit', async () => {
      const { user, input } = setup();
      const big = pdf('big.pdf');
      Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });

      await user.upload(input, big);

      expect(screen.getByRole('alert').textContent).toMatch(/11\.0 MB\. The limit is 10 MB/);
      expect(uploadDocument).not.toHaveBeenCalled();
    });

    it('when several files are dropped at once', () => {
      const { dropZone } = setup();

      fireEvent.drop(dropZone, { dataTransfer: { files: [pdf('a.pdf'), pdf('b.pdf')] } });

      expect(screen.getByRole('alert').textContent).toBe('Upload one PDF at a time.');
      expect(uploadDocument).not.toHaveBeenCalled();
    });
  });

  it('accepts a .pdf file that the browser reports without a MIME type', async () => {
    controlUpload();
    const { user, input } = setup();

    await user.upload(input, pdf('scan.pdf', ''));

    expect(uploadDocument).toHaveBeenCalledTimes(1);
  });

  it('accepts a dropped PDF', () => {
    controlUpload();
    const { dropZone } = setup();

    fireEvent.drop(dropZone, { dataTransfer: { files: [pdf()] } });

    expect(uploadDocument).toHaveBeenCalledTimes(1);
  });

  it('shows progress while uploading, blocks a second upload, then confirms and tells the page', async () => {
    const upload = controlUpload();
    const { user, input, onUploaded } = setup();

    await user.upload(input, pdf());
    await upload.progress(0.42);

    const bar = screen.getByRole('progressbar', { name: 'Upload progress' });
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
    expect(screen.getByText('Uploading invoice.pdf: 42%')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Choose PDF' }) as HTMLButtonElement).disabled).toBe(true);

    await upload.progress(1);
    expect(screen.getByText('Finishing invoice.pdf…')).toBeTruthy();

    await upload.succeed();

    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Uploaded invoice.pdf');
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: 'Choose PDF' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows the server-side failure and allows trying again', async () => {
    const upload = controlUpload();
    const { user, input, onUploaded } = setup();

    await user.upload(input, pdf());
    await upload.fail(new ApiError('This file is larger than 10 MB. Choose a smaller PDF.', 413));

    expect(screen.getByRole('alert').textContent).toBe('This file is larger than 10 MB. Choose a smaller PDF.');
    expect(onUploaded).not.toHaveBeenCalled();

    controlUpload();
    await user.upload(input, pdf());
    expect(uploadDocument).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('can cancel an upload in progress', async () => {
    const upload = controlUpload();
    const { user, input, onUploaded } = setup();

    await user.upload(input, pdf());
    await user.click(screen.getByRole('button', { name: 'Cancel upload' }));

    expect(upload.cancel).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Cancelled the upload of invoice.pdf.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onUploaded).not.toHaveBeenCalled();
  });
});
