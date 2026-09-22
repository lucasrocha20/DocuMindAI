import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { DocumentStatus, Prisma } from '../src/generated/prisma/client.js';
import { InvoiceExtractionError } from '../src/invoice-extraction/invoice-extraction.errors.js';
import type { InvoiceExtractionResult, InvoiceExtractor } from '../src/invoice-extraction/invoice-extractor.interface.js';
import { PdfExtractionService } from '../src/pdf/pdf-extraction.service.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { InvoiceProcessingProcessor } from '../src/processing/invoice-processing.processor.js';
import type { ProcessInvoiceJobData } from '../src/queues/invoice-processing.queue.js';
import { StorageService } from '../src/storage/storage.service.js';

const uploadsDir = resolve(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads');
const GENERIC_FAILURE = 'Processing failed because of an unexpected error. Try uploading the document again.';

function toJob(documentId: string): Job<ProcessInvoiceJobData> {
  return { data: { documentId } } as Job<ProcessInvoiceJobData>;
}

const validExtractionResult: InvoiceExtractionResult = {
  data: {
    supplierName: 'Acme Robotics Ltd.',
    invoiceNumber: 'INV-2024-1042',
    issueDate: '2026-09-10',
    totalAmount: 122.5,
    currency: 'BRL',
    items: [
      { description: 'Widget A', quantity: 5, unitPrice: 12.5, totalPrice: 62.5 },
      { description: 'Widget B', quantity: 2, unitPrice: 30, totalPrice: 60 },
    ],
  },
  metadata: {
    model: 'gpt-4o-mini',
    extractedAt: '2026-09-10T12:00:00.000Z',
    promptTokens: 120,
    completionTokens: 80,
  },
};

class FakeInvoiceExtractor implements InvoiceExtractor {
  extract = vi.fn<(pdfText: string) => Promise<InvoiceExtractionResult>>();
}

describe('InvoiceProcessingProcessor (e2e)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let storage: StorageService;
  let pdfExtraction: PdfExtractionService;
  let fakeExtractor: FakeInvoiceExtractor;
  let processor: InvoiceProcessingProcessor;
  const fixtures: Record<string, Buffer> = {};

  const documentIds: string[] = [];
  const storageKeys: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();

    storage = new StorageService();
    pdfExtraction = new PdfExtractionService();
    for (const name of ['text-invoice', 'insufficient-text', 'corrupt']) {
      fixtures[name] = await readFile(join(import.meta.dirname, 'fixtures', 'pdf', `${name}.pdf`));
    }
  });

  beforeEach(() => {
    fakeExtractor = new FakeInvoiceExtractor();
    processor = new InvoiceProcessingProcessor(prisma, storage, pdfExtraction, fakeExtractor);
  });

  afterEach(async () => {
    await prisma.document.deleteMany({ where: { id: { in: documentIds } } });
    documentIds.length = 0;
    await Promise.all(storageKeys.map((key) => rm(join(uploadsDir, key), { force: true })));
    storageKeys.length = 0;
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  async function createPendingDocument(fixture: string | null = 'text-invoice'): Promise<string> {
    const storageKey = `${randomUUID()}.pdf`;
    if (fixture) {
      storageKeys.push(storageKey);
      await storage.save(storageKey, fixtures[fixture]);
    }
    const document = await prisma.document.create({ data: { filename: 'invoice.pdf', storageKey } });
    documentIds.push(document.id);
    return document.id;
  }

  async function failureOf(documentId: string) {
    const error = await processor.process(toJob(documentId)).then(
      () => null,
      (caught: unknown) => caught,
    );
    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    return { error, document };
  }

  describe('success', () => {
    it('extracts, saves the Invoice + items in one go, stores the raw extraction, and marks COMPLETED', async () => {
      const documentId = await createPendingDocument();
      fakeExtractor.extract.mockResolvedValueOnce(validExtractionResult);

      await processor.process(toJob(documentId));

      const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
      expect(document.status).toBe(DocumentStatus.COMPLETED);
      expect(document.errorMessage).toBeNull();

      const invoice = await prisma.invoice.findUniqueOrThrow({
        where: { documentId },
        include: { items: { orderBy: { position: 'asc' } } },
      });
      expect(invoice.supplierName).toBe('Acme Robotics Ltd.');
      expect(invoice.totalAmount.toString()).toBe('122.5');
      // The order the extractor returned the lines in is what gets stored.
      expect(invoice.items.map((item) => [item.position, item.description])).toEqual([
        [0, 'Widget A'],
        [1, 'Widget B'],
      ]);
      expect(invoice.extractionData).toEqual(validExtractionResult);
    });

    it('sends the text extracted from the stored PDF to the extractor', async () => {
      const documentId = await createPendingDocument();
      fakeExtractor.extract.mockResolvedValueOnce(validExtractionResult);

      await processor.process(toJob(documentId));

      expect(fakeExtractor.extract).toHaveBeenCalledWith(expect.stringContaining('Supplier: Acme Robotics Ltd.'));
    });
  });

  describe('extraction failures', () => {
    it('fails an invalid AI response with a curated message and leaves it retryable', async () => {
      const documentId = await createPendingDocument();
      fakeExtractor.extract.mockRejectedValueOnce(
        new InvoiceExtractionError('The extracted invoice data did not match the expected schema.', 'INVALID_RESPONSE'),
      );

      const { error, document } = await failureOf(documentId);

      expect(error).toBeInstanceOf(InvoiceExtractionError);
      expect(error).not.toBeInstanceOf(UnrecoverableError);
      expect(document.status).toBe(DocumentStatus.FAILED);
      expect(document.errorMessage).toBe('The extracted invoice data did not match the expected schema.');
      await expect(prisma.invoice.findUnique({ where: { documentId } })).resolves.toBeNull();
    });

    it('fails an OpenAI rate limit and leaves it retryable', async () => {
      const documentId = await createPendingDocument();
      fakeExtractor.extract.mockRejectedValueOnce(
        new InvoiceExtractionError('The extraction provider is rate limited. Try again later.', 'RATE_LIMITED'),
      );

      const { error, document } = await failureOf(documentId);

      expect(error).not.toBeInstanceOf(UnrecoverableError);
      expect(document.status).toBe(DocumentStatus.FAILED);
      expect(document.errorMessage).toBe('The extraction provider is rate limited. Try again later.');
    });

    it('does not retry a rejected API key: retrying cannot succeed', async () => {
      const documentId = await createPendingDocument();
      fakeExtractor.extract.mockRejectedValueOnce(
        new InvoiceExtractionError('The extraction provider rejected the request credentials.', 'AUTH_ERROR'),
      );

      const { error, document } = await failureOf(documentId);

      expect(error).toBeInstanceOf(UnrecoverableError);
      expect(document.status).toBe(DocumentStatus.FAILED);
      expect(document.errorMessage).toBe('The extraction provider rejected the request credentials.');
    });
  });

  describe('PDF failures', () => {
    it('fails a scanned/image-only PDF permanently, without calling the extractor', async () => {
      const documentId = await createPendingDocument('insufficient-text');

      const { error, document } = await failureOf(documentId);

      expect(error).toBeInstanceOf(UnrecoverableError);
      expect(document.status).toBe(DocumentStatus.FAILED);
      expect(document.errorMessage).toMatch(/No extractable text/);
      expect(fakeExtractor.extract).not.toHaveBeenCalled();
    });

    it('fails a corrupt PDF permanently', async () => {
      const documentId = await createPendingDocument('corrupt');

      const { error, document } = await failureOf(documentId);

      expect(error).toBeInstanceOf(UnrecoverableError);
      expect(document.errorMessage).toBe('The file could not be read as a valid PDF document.');
      expect(fakeExtractor.extract).not.toHaveBeenCalled();
    });
  });

  describe('internal errors never reach the API', () => {
    it('stores a generic message, not the raw text, when the database transaction fails', async () => {
      const documentId = await createPendingDocument();
      fakeExtractor.extract.mockResolvedValueOnce(validExtractionResult);
      vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(
        new Error('connection to server at "10.0.0.5", port 5432 failed: password authentication failed'),
      );

      const { error, document } = await failureOf(documentId);

      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(UnrecoverableError);
      expect(document.status).toBe(DocumentStatus.FAILED);
      expect(document.errorMessage).toBe(GENERIC_FAILURE);
      await expect(prisma.invoice.findUnique({ where: { documentId } })).resolves.toBeNull();
    });

    it('keeps invoice data out of the logs and out of the error BullMQ persists when Prisma rejects a request', async () => {
      const documentId = await createPendingDocument();
      fakeExtractor.extract.mockResolvedValueOnce(validExtractionResult);
      const logged: string[] = [];
      vi.spyOn(Logger.prototype, 'error').mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      });
      // Prisma quotes the data it was given in the message of validation errors.
      vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(
        new Prisma.PrismaClientValidationError('Invalid invocation: data: { supplierName: "CONFIDENTIAL-SUPPLIER" }', {
          clientVersion: 'test',
        }),
      );

      const { error, document } = await failureOf(documentId);

      expect(logged.length).toBeGreaterThan(0);
      expect(logged.join('\n')).not.toContain('CONFIDENTIAL');
      expect((error as Error).message).not.toContain('CONFIDENTIAL');
      expect((error as Error).stack).not.toContain('CONFIDENTIAL');
      expect(document.errorMessage).toBe(GENERIC_FAILURE);
    });

    it('rolls back the whole Invoice when one line item cannot be saved (a real database transaction)', async () => {
      const documentId = await createPendingDocument();
      // Bypasses the schema on purpose: the real extractor would have rejected this
      // value, so this exercises the transaction itself. The first item is fine and
      // the invoice row is inserted before the second item overflows numeric(12,3).
      fakeExtractor.extract.mockResolvedValueOnce({
        ...validExtractionResult,
        data: {
          ...validExtractionResult.data,
          items: [
            validExtractionResult.data.items[0],
            { description: 'Overflowing quantity', quantity: 1e12, unitPrice: 1, totalPrice: 1 },
          ],
        },
      });

      const { document } = await failureOf(documentId);

      expect(document.status).toBe(DocumentStatus.FAILED);
      expect(document.errorMessage).toBe(GENERIC_FAILURE);
      await expect(prisma.invoice.findUnique({ where: { documentId } })).resolves.toBeNull();
    });

    it('does not leak the filesystem path when the stored file is missing', async () => {
      const documentId = await createPendingDocument(null);

      const { document } = await failureOf(documentId);

      expect(document.status).toBe(DocumentStatus.FAILED);
      expect(document.errorMessage).toBe(GENERIC_FAILURE);
      expect(document.errorMessage).not.toContain(uploadsDir);
    });
  });

  describe('duplicate processing', () => {
    it('does not re-extract or create a duplicate Invoice when the job runs again after success', async () => {
      const documentId = await createPendingDocument();
      fakeExtractor.extract.mockResolvedValueOnce(validExtractionResult);
      await processor.process(toJob(documentId));

      await processor.process(toJob(documentId));

      expect(fakeExtractor.extract).toHaveBeenCalledTimes(1);
      expect(await prisma.invoice.count({ where: { documentId } })).toBe(1);
      const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
      expect(document.status).toBe(DocumentStatus.COMPLETED);
    });

    it('repairs a document left FAILED/PROCESSING although its Invoice already exists', async () => {
      const documentId = await createPendingDocument();
      fakeExtractor.extract.mockResolvedValueOnce(validExtractionResult);
      await processor.process(toJob(documentId));
      await prisma.document.update({ where: { id: documentId }, data: { status: DocumentStatus.FAILED } });

      await processor.process(toJob(documentId));

      const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
      expect(document.status).toBe(DocumentStatus.COMPLETED);
      expect(fakeExtractor.extract).toHaveBeenCalledTimes(1);
    });

    it('treats losing a race to another worker as success, keeping the winner’s Invoice', async () => {
      const documentId = await createPendingDocument();
      // While this worker is talking to the AI, another worker finishes the same document.
      fakeExtractor.extract.mockImplementationOnce(async () => {
        await prisma.invoice.create({
          data: {
            documentId,
            supplierName: 'Winner Ltd.',
            invoiceNumber: 'WIN-1',
            issueDate: new Date('2026-09-11'),
            totalAmount: '1.00',
            currency: 'USD',
            extractionData: {},
          },
        });
        return validExtractionResult;
      });

      await expect(processor.process(toJob(documentId))).resolves.toBeUndefined();

      const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
      expect(document.status).toBe(DocumentStatus.COMPLETED);
      expect(document.errorMessage).toBeNull();
      const invoices = await prisma.invoice.findMany({ where: { documentId } });
      expect(invoices).toHaveLength(1);
      expect(invoices[0].supplierName).toBe('Winner Ltd.');
    });
  });

  describe('missing document', () => {
    it('throws an UnrecoverableError and never touches the extractor', async () => {
      await expect(processor.process(toJob(randomUUID()))).rejects.toBeInstanceOf(UnrecoverableError);
      expect(fakeExtractor.extract).not.toHaveBeenCalled();
    });
  });
});
