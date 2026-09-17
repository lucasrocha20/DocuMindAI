import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('PrismaService (e2e)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  const documentIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.document.deleteMany({ where: { id: { in: documentIds } } });
    documentIds.length = 0;
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('creates a document with an invoice and items, preserving decimal precision', async () => {
    const document = await prisma.document.create({
      data: {
        filename: 'invoice.pdf',
        storageKey: `test/${randomUUID()}.pdf`,
        invoice: {
          create: {
            supplierName: 'Acme Ltd.',
            invoiceNumber: 'INV-1001',
            issueDate: new Date('2026-09-16'),
            totalAmount: '1250.50',
            currency: 'BRL',
            extractionData: { raw: 'sample' },
            items: {
              create: [
                {
                  description: 'Product A',
                  quantity: '2.5',
                  unitPrice: '100.20',
                  totalPrice: '250.50',
                },
              ],
            },
          },
        },
      },
      include: { invoice: { include: { items: true } } },
    });
    documentIds.push(document.id);

    expect(document.status).toBe('PENDING');
    expect(document.invoice?.totalAmount.toFixed(2)).toBe('1250.50');
    expect(document.invoice?.items[0]?.quantity.toFixed(3)).toBe('2.500');
  });

  it('rejects a duplicate storageKey', async () => {
    const storageKey = `test/${randomUUID()}.pdf`;
    const first = await prisma.document.create({
      data: { filename: 'a.pdf', storageKey },
    });
    documentIds.push(first.id);

    await expect(
      prisma.document.create({ data: { filename: 'b.pdf', storageKey } }),
    ).rejects.toThrow();
  });

  it('cascades delete from document to invoice and invoice items', async () => {
    const document = await prisma.document.create({
      data: {
        filename: 'invoice.pdf',
        storageKey: `test/${randomUUID()}.pdf`,
        invoice: {
          create: {
            supplierName: 'Acme Ltd.',
            invoiceNumber: 'INV-1002',
            issueDate: new Date('2026-09-16'),
            totalAmount: '10.00',
            currency: 'BRL',
            extractionData: {},
            items: {
              create: [{ description: 'Item', quantity: '1', unitPrice: '10.00', totalPrice: '10.00' }],
            },
          },
        },
      },
      include: { invoice: { include: { items: true } } },
    });
    const invoiceId = document.invoice!.id;

    await prisma.document.delete({ where: { id: document.id } });

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    const items = await prisma.invoiceItem.findMany({ where: { invoiceId } });
    expect(invoice).toBeNull();
    expect(items).toHaveLength(0);
  });
});
