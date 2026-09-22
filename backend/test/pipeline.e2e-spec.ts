import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { type Queue, UnrecoverableError } from 'bullmq';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { InvoiceExtractionError } from '../src/invoice-extraction/invoice-extraction.errors.js';
import {
  INVOICE_EXTRACTOR,
  type InvoiceExtractionResult,
  type InvoiceExtractor,
} from '../src/invoice-extraction/invoice-extractor.interface.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { INVOICE_PROCESSING_QUEUE } from '../src/queues/invoice-processing.queue.js';

// The whole pipeline over real HTTP, Redis/BullMQ (with its worker), the real
// PDF parser, Postgres and the filesystem. The one fake is the extractor, i.e.
// the paid external API.
const uploadsDir = resolve(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads');

function resultFor(supplierName: string): InvoiceExtractionResult {
  return {
    data: {
      supplierName,
      invoiceNumber: 'INV-PIPE-1',
      issueDate: '2026-09-10',
      totalAmount: 122.5,
      currency: 'BRL',
      items: [
        { description: 'Widget A', quantity: 5, unitPrice: 12.5, totalPrice: 62.5 },
        { description: 'Widget B', quantity: 2, unitPrice: 30, totalPrice: 60 },
      ],
    },
    metadata: { model: 'fake-model', extractedAt: '2026-09-10T12:00:00.000Z', promptTokens: 1, completionTokens: 1 },
  };
}

// Polls until `isDone` or the timeout, then returns the last value so a failing
// expectation shows what the state actually was.
async function eventually<T>(read: () => Promise<T>, isDone: (value: T) => boolean, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (isDone(value) || Date.now() > deadline) return value;
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 100));
  }
}

describe('Invoice pipeline (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let queue: Queue;
  let textInvoicePdf: Buffer;
  let scannedPdf: Buffer;
  const extractor = { extract: vi.fn<InvoiceExtractor['extract']>() };
  const documentIds: string[] = [];

  beforeAll(async () => {
    const fixture = (name: string) => readFile(join(import.meta.dirname, 'fixtures', 'pdf', name));
    textInvoicePdf = await fixture('text-invoice.pdf');
    scannedPdf = await fixture('insufficient-text.pdf');

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(INVOICE_EXTRACTOR)
      .useValue(extractor)
      .compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);
    queue = app.get(getQueueToken(INVOICE_PROCESSING_QUEUE));
    await app.init();
  });

  beforeEach(() => {
    extractor.extract.mockReset();
  });

  afterEach(async () => {
    const documents = await prisma.document.findMany({
      where: { id: { in: documentIds } },
      select: { storageKey: true },
    });
    await prisma.document.deleteMany({ where: { id: { in: documentIds } } });
    await Promise.all([
      ...documents.map((doc) => rm(join(uploadsDir, doc.storageKey), { force: true })),
      ...documentIds.map((id) => queue.getJob(id).then((job) => job?.remove().catch(() => undefined))),
    ]);
    documentIds.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  async function upload(pdf: Buffer): Promise<string> {
    const response = await request(app.getHttpServer()).post('/documents/upload').attach('file', pdf, 'invoice.pdf').expect(201);
    documentIds.push(response.body.id);
    return response.body.id;
  }

  interface DocumentBody {
    status: string;
    errorMessage: string | null;
    invoiceId: string | null;
  }

  async function documentOf(id: string): Promise<DocumentBody> {
    return (await request(app.getHttpServer()).get(`/documents/${id}`)).body;
  }

  const isFinal = (document: DocumentBody) => document.status === 'COMPLETED' || document.status === 'FAILED';

  it('takes an uploaded PDF all the way to an invoice served by the API', async () => {
    const supplier = `Pipeline ${randomUUID().slice(0, 8)} Ltd.`;
    extractor.extract.mockResolvedValue(resultFor(supplier));

    const id = await upload(textInvoicePdf);
    const document = await eventually(() => documentOf(id), isFinal);

    expect(document.status).toBe('COMPLETED');
    expect(document.errorMessage).toBeNull();
    expect(document.invoiceId).toEqual(expect.any(String));
    // The extractor got the text the real PDF parser pulled out of the stored file.
    expect(extractor.extract).toHaveBeenCalledTimes(1);
    expect(extractor.extract.mock.calls[0][0]).toContain('Supplier: Acme Robotics Ltd.');

    const list = await request(app.getHttpServer()).get('/invoices').query({ supplierName: supplier }).expect(200);
    expect(list.body.meta.total).toBe(1);
    const detail = await request(app.getHttpServer()).get(`/invoices/${list.body.data[0].id}`).expect(200);
    expect(detail.body).toMatchObject({ documentId: id, supplierName: supplier, totalAmount: '122.50', currency: 'BRL' });
    // The document points at exactly this invoice.
    expect(document.invoiceId).toBe(detail.body.id);
    expect(detail.body.items.map((item: { description: string }) => item.description)).toEqual(['Widget A', 'Widget B']);
  });

  it('retries a transient failure and still ends with exactly one invoice', async () => {
    const supplier = `Retry ${randomUUID().slice(0, 8)} Ltd.`;
    extractor.extract
      .mockRejectedValueOnce(new InvoiceExtractionError('The extraction provider is rate limited. Try again later.', 'RATE_LIMITED'))
      .mockResolvedValueOnce(resultFor(supplier));

    const id = await upload(textInvoicePdf);
    // The first attempt fails; BullMQ retries after its 2s backoff.
    const document = await eventually(() => documentOf(id), (doc) => doc.status === 'COMPLETED', 15_000);

    expect(document.status).toBe('COMPLETED');
    expect(extractor.extract).toHaveBeenCalledTimes(2);
    expect(await prisma.invoice.count({ where: { documentId: id } })).toBe(1);
    const list = await request(app.getHttpServer()).get('/invoices').query({ supplierName: supplier }).expect(200);
    expect(list.body.meta.total).toBe(1);
  }, 25_000);

  it('fails a scanned PDF once, with a clear reason, and does not retry it', async () => {
    const id = await upload(scannedPdf);
    const document = await eventually(() => documentOf(id), isFinal);

    expect(document.status).toBe('FAILED');
    expect(document.errorMessage).toMatch(/No extractable text/);
    expect(document.invoiceId).toBeNull();
    expect(extractor.extract).not.toHaveBeenCalled();

    // A retry would leave the job "delayed"; a permanent failure goes straight to "failed".
    const job = (await queue.getJob(id))!;
    const state = await eventually(() => job.getState(), (s) => s !== 'active' && s !== 'waiting', 5000);
    expect(state).toBe('failed');
    expect(job.attemptsMade).toBe(1);
  });

  it('never exposes internal error details through the API', async () => {
    // UnrecoverableError only stops retries here, so the test doesn't wait out backoff.
    extractor.extract.mockRejectedValue(
      new UnrecoverableError('connect ECONNREFUSED 10.0.0.5:5432 user=documind password=hunter2 path=/srv/uploads/x.pdf'),
    );

    const id = await upload(textInvoicePdf);
    const document = await eventually(() => documentOf(id), isFinal);

    expect(document.status).toBe('FAILED');
    expect(document.errorMessage).toBe('Processing failed because of an unexpected error. Try uploading the document again.');
    const listed = await request(app.getHttpServer()).get('/documents').expect(200);
    expect(JSON.stringify(listed.body)).not.toMatch(/hunter2|10\.0\.0\.5|\/srv\/uploads/);
  });
});
