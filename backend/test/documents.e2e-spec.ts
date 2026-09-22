import { readFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { InvoiceProcessingProcessor } from '../src/processing/invoice-processing.processor.js';
import { INVOICE_PROCESSING_QUEUE, PROCESS_INVOICE_JOB } from '../src/queues/invoice-processing.queue.js';

const INVALID_PDF = Buffer.from('this is not a pdf file');
const uploadsDir = resolve(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads');

describe('Documents (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let queue: Queue;
  let validPdf: Buffer;
  const documentIds: string[] = [];

  beforeAll(async () => {
    validPdf = await readFile(join(import.meta.dirname, 'fixtures', 'pdf', 'text-invoice.pdf'));

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // No worker: jobs stay queued, so the tests can inspect them and nothing
      // (least of all the real OpenAI client) runs behind the scenes.
      .overrideProvider(InvoiceProcessingProcessor)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);
    queue = app.get(getQueueToken(INVOICE_PROCESSING_QUEUE));
    await app.init();
  });

  afterEach(async () => {
    const documents = await prisma.document.findMany({
      where: { id: { in: documentIds } },
      select: { storageKey: true },
    });
    await prisma.document.deleteMany({ where: { id: { in: documentIds } } });
    await Promise.all([
      ...documents.map((doc) => rm(join(uploadsDir, doc.storageKey), { force: true })),
      ...documentIds.map(async (id) => (await queue.getJob(id))?.remove()),
    ]);
    documentIds.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  function upload(content: Buffer, filename = 'invoice.pdf', field = 'file') {
    return request(app.getHttpServer()).post('/documents/upload').attach(field, content, filename);
  }

  describe('POST /documents/upload', () => {
    it('creates a PENDING document without leaking the storage path', async () => {
      const response = await upload(validPdf).expect(201);
      documentIds.push(response.body.id);

      expect(response.body).toEqual({
        id: expect.any(String),
        filename: 'invoice.pdf',
        status: 'PENDING',
        errorMessage: null,
        invoiceId: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('queues exactly one processing job for the document', async () => {
      const response = await upload(validPdf).expect(201);
      const documentId = response.body.id as string;
      documentIds.push(documentId);

      const job = await queue.getJob(documentId);
      expect(job?.name).toBe(PROCESS_INVOICE_JOB);
      expect(job?.data).toEqual({ documentId });
      expect(job?.opts.attempts).toBe(3);
      // Still waiting: proves nothing consumed it during the test.
      expect(await job?.getState()).toBe('waiting');
    });

    it('stores the file under a generated key and never uses the client filename on disk', async () => {
      const response = await upload(validPdf, '../../etc/evil.pdf').expect(201);
      documentIds.push(response.body.id);

      expect(response.body.filename).toBe('evil.pdf');
      const stored = await prisma.document.findUniqueOrThrow({ where: { id: response.body.id } });
      expect(stored.storageKey).toMatch(/^[0-9a-f-]{36}\.pdf$/);
      expect((await stat(join(uploadsDir, stored.storageKey))).size).toBe(validPdf.length);
    });

    it('rejects content that is not a real PDF, even with a .pdf name, and stores nothing', async () => {
      // Scoped by filename: other e2e files write to this database in parallel.
      const filename = `rejected-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;

      const response = await upload(INVALID_PDF, filename).expect(422);

      expect(response.body).toEqual({
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: 'The uploaded file is not a valid PDF.',
      });
      expect(await prisma.document.count({ where: { filename } })).toBe(0);
    });

    it('rejects an upload with no file attached', async () => {
      await request(app.getHttpServer()).post('/documents/upload').expect(422);
    });

    it('rejects a file sent under the wrong field name', async () => {
      // Regression: multer 2's message changed and Nest's text-matching mapped this to a 500.
      const response = await upload(validPdf, 'invoice.pdf', 'document').expect(400);

      expect(response.body).toEqual({
        statusCode: 400,
        error: 'Bad Request',
        message: expect.stringMatching(/field/i),
      });
    });

    it('rejects a file over the 10 MB limit with 413', async () => {
      const tooBig = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10 * 1024 * 1024, 32)]);

      await upload(tooBig).expect(413);
    });
  });

  describe('GET /documents', () => {
    it('lists uploaded documents newest first and fetches one by id', async () => {
      const first = await upload(validPdf, 'first.pdf').expect(201);
      const second = await upload(validPdf, 'second.pdf').expect(201);
      documentIds.push(first.body.id, second.body.id);

      const list = await request(app.getHttpServer()).get('/documents').expect(200);
      const ids: string[] = list.body.map((doc: { id: string }) => doc.id);
      expect(ids.indexOf(second.body.id)).toBeLessThan(ids.indexOf(first.body.id));

      const one = await request(app.getHttpServer()).get(`/documents/${first.body.id}`).expect(200);
      expect(one.body.id).toBe(first.body.id);
      expect(one.body.storageKey).toBeUndefined();
    });

    it('returns 404 for a well-formed but unknown document id', async () => {
      await request(app.getHttpServer()).get('/documents/00000000-0000-0000-0000-000000000000').expect(404);
    });

    it('returns 400 for a malformed document id', async () => {
      await request(app.getHttpServer()).get('/documents/not-a-uuid').expect(400);
    });
  });
});
