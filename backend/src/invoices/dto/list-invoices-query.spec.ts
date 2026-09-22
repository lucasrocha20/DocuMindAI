import { describe, expect, it } from 'vitest';
import { listInvoicesQuerySchema } from './list-invoices-query.js';

describe('listInvoicesQuerySchema', () => {
  it('applies defaults when nothing is sent', () => {
    expect(listInvoicesQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
      supplierName: undefined,
      invoiceNumber: undefined,
    });
  });

  it('coerces the strings a query string always delivers', () => {
    const query = listInvoicesQuerySchema.parse({ page: '3', pageSize: '15' });

    expect(query.page).toBe(3);
    expect(query.pageSize).toBe(15);
  });

  it('accepts the boundary values', () => {
    expect(listInvoicesQuerySchema.safeParse({ page: '1', pageSize: '1' }).success).toBe(true);
    expect(listInvoicesQuerySchema.safeParse({ pageSize: '100' }).success).toBe(true);
  });

  it.each([
    ['page 0', { page: '0' }],
    ['a negative page', { page: '-1' }],
    ['a non-numeric page', { page: 'abc' }],
    ['a fractional page', { page: '1.5' }],
    ['pageSize 0', { pageSize: '0' }],
    ['pageSize above the maximum', { pageSize: '101' }],
    ['a fractional pageSize', { pageSize: '2.5' }],
    ['a supplierName over 255 characters', { supplierName: 'x'.repeat(256) }],
    ['an invoiceNumber over 100 characters', { invoiceNumber: 'x'.repeat(101) }],
  ])('rejects %s', (_label, query) => {
    expect(listInvoicesQuerySchema.safeParse(query).success).toBe(false);
  });

  it('trims filters and treats blank ones as "no filter"', () => {
    const query = listInvoicesQuerySchema.parse({ supplierName: '  Acme  ', invoiceNumber: '   ' });

    expect(query.supplierName).toBe('Acme');
    expect(query.invoiceNumber).toBeUndefined();
    expect(listInvoicesQuerySchema.parse({ supplierName: '' }).supplierName).toBeUndefined();
  });

  it('ignores parameters it does not know', () => {
    expect(listInvoicesQuerySchema.parse({ sort: 'evil', page: '2' })).not.toHaveProperty('sort');
  });
});
