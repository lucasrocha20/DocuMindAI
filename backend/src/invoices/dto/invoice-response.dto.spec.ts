import { describe, expect, it } from 'vitest';
import { type Invoice, type InvoiceItem, Prisma } from '../../generated/prisma/client.js';
import { toInvoiceDetail, toInvoiceSummary } from './invoice-response.dto.js';

const invoice: Invoice = {
  id: 'inv-1',
  documentId: 'doc-1',
  supplierName: 'Acme Robotics Ltd.',
  invoiceNumber: 'INV-2024-1042',
  issueDate: new Date('2026-09-10T00:00:00.000Z'),
  totalAmount: new Prisma.Decimal('122.5'),
  currency: 'BRL',
  extractionData: { secret: 'raw AI payload' },
  createdAt: new Date('2026-09-11T08:00:00.000Z'),
  updatedAt: new Date('2026-09-12T09:30:00.000Z'),
};

const item: InvoiceItem = {
  id: 'item-1',
  invoiceId: 'inv-1',
  description: 'Widget A',
  quantity: new Prisma.Decimal('2.5'),
  unitPrice: new Prisma.Decimal('24'),
  totalPrice: new Prisma.Decimal('60'),
  position: 3,
};

describe('invoice DTO mappers', () => {
  it('summarises an invoice with fixed-scale money and a date-only issue date', () => {
    expect(toInvoiceSummary(invoice)).toEqual({
      id: 'inv-1',
      documentId: 'doc-1',
      supplierName: 'Acme Robotics Ltd.',
      invoiceNumber: 'INV-2024-1042',
      issueDate: '2026-09-10',
      totalAmount: '122.50',
      currency: 'BRL',
      createdAt: '2026-09-11T08:00:00.000Z',
    });
  });

  it('adds updatedAt and items (row ids, foreign keys and position stripped) for the detail view', () => {
    const detail = toInvoiceDetail({ ...invoice, items: [item] });

    expect(detail.updatedAt).toBe('2026-09-12T09:30:00.000Z');
    expect(detail.items).toEqual([{ description: 'Widget A', quantity: '2.500', unitPrice: '24.00', totalPrice: '60.00' }]);
  });

  it('never exposes the raw extraction payload', () => {
    const detail = toInvoiceDetail({ ...invoice, items: [item] });

    expect(JSON.stringify(detail)).not.toContain('raw AI payload');
    expect(detail).not.toHaveProperty('extractionData');
  });

  it('keeps trailing zeros and does not round through floating point', () => {
    const precise = { ...invoice, totalAmount: new Prisma.Decimal('10000000000.10') };

    expect(toInvoiceSummary(precise).totalAmount).toBe('10000000000.10');
  });
});
