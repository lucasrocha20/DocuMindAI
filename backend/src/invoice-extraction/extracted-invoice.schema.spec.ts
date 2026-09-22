import { describe, expect, it } from 'vitest';
import { extractedInvoiceSchema } from './extracted-invoice.schema.js';

const valid = {
  supplierName: 'Acme Robotics Ltd.',
  invoiceNumber: 'INV-2024-1042',
  issueDate: '2026-09-10',
  totalAmount: 122.5,
  currency: 'BRL',
  items: [{ description: 'Widget A', quantity: 5, unitPrice: 12.5, totalPrice: 62.5 }],
};

function withOverride(overrides: Record<string, unknown>) {
  return { ...valid, ...overrides };
}

function itemWith(overrides: Record<string, unknown>) {
  return withOverride({ items: [{ ...valid.items[0], ...overrides }] });
}

describe('extractedInvoiceSchema', () => {
  it('accepts a well-formed invoice', () => {
    expect(extractedInvoiceSchema.parse(valid)).toEqual(valid);
  });

  it('trims text, upper-cases the currency, and drops unknown fields', () => {
    const parsed = extractedInvoiceSchema.parse(
      withOverride({ supplierName: '  Acme  ', currency: ' brl ', notes: 'ignore me' }),
    );

    expect(parsed.supplierName).toBe('Acme');
    expect(parsed.currency).toBe('BRL');
    expect(parsed).not.toHaveProperty('notes');
  });

  describe('rejects', () => {
    it.each(['2026-13-45', '2026-02-30', '10/09/2026', '2026-9-1', '2026-09-10T00:00:00Z', ''])(
      'the invalid issue date %j',
      (issueDate) => {
        expect(extractedInvoiceSchema.safeParse(withOverride({ issueDate })).success).toBe(false);
      },
    );

    it.each(['BR', 'REAL', 'R$', '12A', ''])('the invalid currency %j', (currency) => {
      expect(extractedInvoiceSchema.safeParse(withOverride({ currency })).success).toBe(false);
    });

    it.each(['supplierName', 'invoiceNumber', 'issueDate', 'totalAmount', 'currency', 'items'])(
      'a missing %s',
      (field) => {
        const { [field]: _removed, ...rest } = valid as Record<string, unknown>;

        expect(extractedInvoiceSchema.safeParse(rest).success).toBe(false);
      },
    );

    it('numbers sent as strings: the model must return real numbers', () => {
      expect(extractedInvoiceSchema.safeParse(withOverride({ totalAmount: '122.50' })).success).toBe(false);
      expect(extractedInvoiceSchema.safeParse(itemWith({ quantity: '5' })).success).toBe(false);
    });

    it('negative or non-finite amounts, and a zero quantity', () => {
      expect(extractedInvoiceSchema.safeParse(withOverride({ totalAmount: -1 })).success).toBe(false);
      expect(extractedInvoiceSchema.safeParse(itemWith({ unitPrice: -0.01 })).success).toBe(false);
      expect(extractedInvoiceSchema.safeParse(itemWith({ totalPrice: Number.POSITIVE_INFINITY })).success).toBe(false);
      expect(extractedInvoiceSchema.safeParse(itemWith({ quantity: 0 })).success).toBe(false);
    });

    it('empty text fields and over-long ones', () => {
      expect(extractedInvoiceSchema.safeParse(withOverride({ supplierName: '   ' })).success).toBe(false);
      expect(extractedInvoiceSchema.safeParse(withOverride({ supplierName: 'x'.repeat(256) })).success).toBe(false);
      expect(extractedInvoiceSchema.safeParse(withOverride({ invoiceNumber: 'x'.repeat(101) })).success).toBe(false);
      expect(extractedInvoiceSchema.safeParse(itemWith({ description: 'x'.repeat(501) })).success).toBe(false);
    });

    it('no items, or more than 200', () => {
      expect(extractedInvoiceSchema.safeParse(withOverride({ items: [] })).success).toBe(false);
      expect(
        extractedInvoiceSchema.safeParse(withOverride({ items: Array(201).fill(valid.items[0]) })).success,
      ).toBe(false);
      expect(
        extractedInvoiceSchema.safeParse(withOverride({ items: Array(200).fill(valid.items[0]) })).success,
      ).toBe(true);
    });

    it('a non-object response', () => {
      for (const value of [null, 'text', 42, [], undefined]) {
        expect(extractedInvoiceSchema.safeParse(value).success).toBe(false);
      }
    });
  });

  // The database columns are numeric(12,2) / numeric(12,3). Values beyond them would pass
  // validation and then fail at insert; rejecting them here is a clear INVALID_RESPONSE.
  describe('database column limits', () => {
    it('accepts the largest values the columns can hold', () => {
      const largest = itemWith({ quantity: 999_999_999.999, unitPrice: 9_999_999_999.99, totalPrice: 9_999_999_999.99 });

      expect(extractedInvoiceSchema.safeParse({ ...largest, totalAmount: 9_999_999_999.99 }).success).toBe(true);
    });

    it.each([
      ['totalAmount', withOverride({ totalAmount: 10_000_000_000 })],
      ['unitPrice', itemWith({ unitPrice: 10_000_000_000 })],
      ['totalPrice', itemWith({ totalPrice: 10_000_000_000 })],
      ['quantity', itemWith({ quantity: 1_000_000_000 })],
    ])('rejects a %s that overflows its column', (_field, invoice) => {
      expect(extractedInvoiceSchema.safeParse(invoice).success).toBe(false);
    });
  });
});
