import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DocumentStatus } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { InvoiceProcessingProcessor } from '../src/processing/invoice-processing.processor.js';

// E2E files run in parallel against one shared database, so every count and
// page assertion is scoped to this marker via the supplierName filter.
const marker = `E2E-${randomUUID().slice(0, 8)}`;

interface SeedOptions {
  supplierName?: string;
  invoiceNumber?: string;
  createdAt?: Date;
}

describe('Invoices (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const documentIds: string[] = [];

  async function seedInvoice(options: SeedOptions = {}) {
    const document = await prisma.document.create({
      data: {
        filename: 'invoice.pdf',
        storageKey: `${randomUUID()}.pdf`,
        status: DocumentStatus.COMPLETED,
        invoice: {
          create: {
            supplierName: options.supplierName ?? `${marker} Supplier`,
            invoiceNumber: options.invoiceNumber ?? `INV-${randomUUID().slice(0, 8)}`,
            issueDate: new Date('2026-09-10'),
            totalAmount: '122.50',
            currency: 'BRL',
            extractionData: { rawAiPayload: 'must never be exposed' },
            createdAt: options.createdAt,
            items: {
              create: [
                // Inserted in reverse, so only `position` can put them back in invoice order.
                { description: 'Widget B', quantity: '2.5', unitPrice: '24', totalPrice: '60', position: 1 },
                { description: 'Widget A', quantity: '5', unitPrice: '12.50', totalPrice: '62.50', position: 0 },
              ],
            },
          },
        },
      },
      include: { invoice: true },
    });
    documentIds.push(document.id);
    return document.invoice!;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Only the pipeline e2e spec runs a worker; here it would compete for jobs.
      .overrideProvider(InvoiceProcessingProcessor)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);
    await app.init();
  });

  afterEach(async () => {
    await prisma.document.deleteMany({ where: { id: { in: documentIds } } });
    documentIds.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  function listInvoices(query: Record<string, string | number> = {}) {
    return request(app.getHttpServer())
      .get('/invoices')
      .query({ supplierName: marker, ...query });
  }

  describe('GET /invoices', () => {
    it('lists invoices newest first, exposing only the summary fields', async () => {
      const older = await seedInvoice({ createdAt: new Date('2026-09-01T10:00:00Z') });
      const newer = await seedInvoice({ createdAt: new Date('2026-09-02T10:00:00Z') });

      const response = await listInvoices().expect(200);

      expect(response.body.meta).toEqual({ page: 1, pageSize: 20, total: 2, totalPages: 1 });
      expect(response.body.data.map((invoice: { id: string }) => invoice.id)).toEqual([newer.id, older.id]);
      // toEqual on the exact shape also proves nothing else (items, extractionData) leaks.
      expect(response.body.data[0]).toEqual({
        id: newer.id,
        documentId: newer.documentId,
        supplierName: `${marker} Supplier`,
        invoiceNumber: newer.invoiceNumber,
        issueDate: '2026-09-10',
        totalAmount: '122.50',
        currency: 'BRL',
        createdAt: '2026-09-02T10:00:00.000Z',
      });
    });

    it('filters by supplierName and invoiceNumber, case-insensitively and by partial match', async () => {
      const tag = randomUUID().slice(0, 8);
      const acme = await seedInvoice({ supplierName: `${marker} Acme Robotics`, invoiceNumber: `INV-${tag}-AAA` });
      const globex = await seedInvoice({ supplierName: `${marker} Globex`, invoiceNumber: `INV-${tag}-BBB` });

      const bySupplier = await listInvoices({ supplierName: `${marker.toLowerCase()} acme` }).expect(200);
      expect(bySupplier.body.data.map((i: { id: string }) => i.id)).toEqual([acme.id]);

      const byNumber = await listInvoices({ invoiceNumber: `${tag.toLowerCase()}-bbb` }).expect(200);
      expect(byNumber.body.data.map((i: { id: string }) => i.id)).toEqual([globex.id]);

      const noMatch = await listInvoices({ invoiceNumber: `${tag}-ZZZ` }).expect(200);
      expect(noMatch.body.data).toEqual([]);
      expect(noMatch.body.meta.total).toBe(0);
      expect(noMatch.body.meta.totalPages).toBe(0);
    });

    it('treats a blank filter as no filter', async () => {
      await seedInvoice();

      const response = await listInvoices({ invoiceNumber: '' }).expect(200);

      expect(response.body.meta.total).toBe(1);
    });

    it.each(['%', '_', '\\'])('matches %s literally instead of as a LIKE wildcard', async (character) => {
      await seedInvoice();
      const withCharacter = await seedInvoice({ supplierName: `${marker} 50${character}off` });

      const wildcardOnly = await request(app.getHttpServer()).get('/invoices').query({ supplierName: character });
      const scoped = await listInvoices({ supplierName: `${marker} 50${character}` }).expect(200);

      expect(wildcardOnly.status).toBe(200);
      expect(wildcardOnly.body.data.every((i: { supplierName: string }) => i.supplierName.includes(character))).toBe(
        true,
      );
      expect(scoped.body.data.map((i: { id: string }) => i.id)).toEqual([withCharacter.id]);
    });
  });

  describe('pagination', () => {
    it('splits results across pages without overlap and reports accurate totals', async () => {
      const baseTime = new Date('2026-09-01T10:00:00Z').getTime();
      const seeded = [];
      for (let i = 0; i < 5; i++) {
        seeded.push(await seedInvoice({ createdAt: new Date(baseTime + i * 1000) }));
      }
      const expectedIdsNewestFirst = seeded.map((invoice) => invoice.id).reverse();

      const page1 = await listInvoices({ page: 1, pageSize: 2 }).expect(200);
      const page2 = await listInvoices({ page: 2, pageSize: 2 }).expect(200);
      const page3 = await listInvoices({ page: 3, pageSize: 2 }).expect(200);

      expect(page1.body.meta).toEqual({ page: 1, pageSize: 2, total: 5, totalPages: 3 });
      expect(page1.body.data).toHaveLength(2);
      expect(page2.body.data).toHaveLength(2);
      expect(page3.body.data).toHaveLength(1);

      const pagedIds = [...page1.body.data, ...page2.body.data, ...page3.body.data].map((i: { id: string }) => i.id);
      expect(pagedIds).toEqual(expectedIdsNewestFirst);
    });

    it('returns an empty page, not an error, beyond the last page', async () => {
      await seedInvoice();

      const response = await listInvoices({ page: 4, pageSize: 2 }).expect(200);

      expect(response.body.data).toEqual([]);
      expect(response.body.meta).toEqual({ page: 4, pageSize: 2, total: 1, totalPages: 1 });
    });

    it.each([
      ['page=0', { page: 0 }],
      ['page=abc', { page: 'abc' }],
      ['pageSize=0', { pageSize: 0 }],
      ['pageSize above the maximum', { pageSize: 101 }],
      ['a fractional pageSize', { pageSize: 1.5 }],
    ])('rejects invalid pagination (%s) with 400', async (_label, query) => {
      const response = await listInvoices(query).expect(400);

      expect(response.body.statusCode).toBe(400);
      expect(Array.isArray(response.body.message)).toBe(true);
    });
  });

  describe('GET /invoices/:id', () => {
    it('returns the invoice with its line items and no internal fields', async () => {
      const invoice = await seedInvoice();

      const response = await request(app.getHttpServer()).get(`/invoices/${invoice.id}`).expect(200);

      expect(response.body).toEqual({
        id: invoice.id,
        documentId: invoice.documentId,
        supplierName: `${marker} Supplier`,
        invoiceNumber: invoice.invoiceNumber,
        issueDate: '2026-09-10',
        totalAmount: '122.50',
        currency: 'BRL',
        createdAt: invoice.createdAt.toISOString(),
        updatedAt: invoice.updatedAt.toISOString(),
        items: expect.any(Array),
      });
      // Lines come back in invoice order, whatever order they were stored in.
      expect(response.body.items).toEqual([
        { description: 'Widget A', quantity: '5.000', unitPrice: '12.50', totalPrice: '62.50' },
        { description: 'Widget B', quantity: '2.500', unitPrice: '24.00', totalPrice: '60.00' },
      ]);
    });

    it('returns 404 for a well-formed but unknown invoice id', async () => {
      const response = await request(app.getHttpServer()).get(`/invoices/${randomUUID()}`).expect(404);

      expect(response.body.message).toBe('Invoice not found');
    });

    it('returns 400 for a malformed invoice id', async () => {
      await request(app.getHttpServer()).get('/invoices/not-a-uuid').expect(400);
    });
  });
});
