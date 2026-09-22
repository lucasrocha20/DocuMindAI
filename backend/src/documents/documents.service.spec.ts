import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentStatus } from '../generated/prisma/client.js';
import { PROCESS_INVOICE_JOB } from '../queues/invoice-processing.queue.js';
import { ENQUEUE_TIMEOUT_MS } from './documents.constants.js';
import { DocumentsService } from './documents.service.js';

const now = new Date('2026-09-20T12:00:00Z');
const savedDocument = {
  id: 'doc-1',
  filename: 'invoice.pdf',
  storageKey: 'ignored',
  status: DocumentStatus.PENDING,
  errorMessage: null,
  createdAt: now,
  updatedAt: now,
};

function pdfFile(originalname = 'invoice.pdf') {
  return { originalname, buffer: Buffer.from('%PDF-1.4') } as Express.Multer.File;
}

describe('DocumentsService', () => {
  // Plain hand-written fakes: the service only calls these few methods.
  const prisma = {
    document: { create: vi.fn(), update: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  };
  const storage = { save: vi.fn(), remove: vi.fn() };
  const queue = { add: vi.fn() };
  const service = new DocumentsService(prisma as never, storage as never, queue as never);

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.document.create.mockResolvedValue(savedDocument);
    prisma.document.update.mockResolvedValue(savedDocument);
    storage.save.mockResolvedValue(undefined);
    storage.remove.mockResolvedValue(undefined);
    queue.add.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('upload', () => {
    it('stores the file under a generated key, never the client filename', async () => {
      await service.upload(pdfFile('../../etc/evil name.pdf'));

      const [storageKey] = storage.save.mock.calls[0];
      expect(storageKey).toMatch(/^[0-9a-f-]{36}\.pdf$/);
      const created = prisma.document.create.mock.calls[0][0].data;
      expect(created.storageKey).toBe(storageKey);
      expect(created.filename).toBe('evil_name.pdf');
    });

    it('queues one deduplicated job with retry/backoff, and returns the DTO without storageKey', async () => {
      const result = await service.upload(pdfFile());

      expect(queue.add).toHaveBeenCalledWith(
        PROCESS_INVOICE_JOB,
        { documentId: 'doc-1' },
        expect.objectContaining({ jobId: 'doc-1', attempts: 3, backoff: { type: 'exponential', delay: 2000 } }),
      );
      expect(result).toEqual({
        id: 'doc-1',
        filename: 'invoice.pdf',
        status: DocumentStatus.PENDING,
        errorMessage: null,
        invoiceId: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
    });

    it('marks the document FAILED and responds 500 when the job cannot be queued', async () => {
      queue.add.mockRejectedValueOnce(new Error('READONLY You can\'t write against a read only replica'));

      await expect(service.upload(pdfFile())).rejects.toBeInstanceOf(InternalServerErrorException);

      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: { status: DocumentStatus.FAILED, errorMessage: 'Failed to queue document for processing' },
      });
    });

    it('gives up on a queue that never answers (Redis down) instead of hanging the request', async () => {
      vi.useFakeTimers();
      queue.add.mockReturnValueOnce(new Promise(() => {}));

      const outcome = service.upload(pdfFile()).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(ENQUEUE_TIMEOUT_MS);

      expect(await outcome).toBeInstanceOf(InternalServerErrorException);
      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: DocumentStatus.FAILED }) }),
      );
    });

    it('removes the stored file when the database insert fails, and surfaces the original error', async () => {
      const failure = new Error('database is down');
      prisma.document.create.mockRejectedValueOnce(failure);

      await expect(service.upload(pdfFile())).rejects.toBe(failure);

      expect(storage.remove).toHaveBeenCalledWith(storage.save.mock.calls[0][0]);
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('findAll / findOne', () => {
    it('lists newest first, capped at 100', async () => {
      prisma.document.findMany.mockResolvedValueOnce([savedDocument]);

      const result = await service.findAll();

      expect(prisma.document.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { invoice: { select: { id: true } } },
      });
      expect(result).toHaveLength(1);
      expect(result[0].invoiceId).toBeNull();
    });

    it('exposes the id of the invoice extracted from a document, and only its id', async () => {
      prisma.document.findUnique.mockResolvedValueOnce({ ...savedDocument, invoice: { id: 'inv-9' } });

      const result = await service.findOne('doc-1');

      expect(result.invoiceId).toBe('inv-9');
      expect(result).not.toHaveProperty('invoice');
    });

    it('throws NotFoundException for an unknown document', async () => {
      prisma.document.findUnique.mockResolvedValueOnce(null);

      await expect(service.findOne('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
