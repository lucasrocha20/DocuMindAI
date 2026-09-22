import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { withoutSensitiveDetails } from './sanitize-error.js';

describe('withoutSensitiveDetails', () => {
  it('replaces a Prisma validation error, whose message quotes the request data', () => {
    const leaky = new Prisma.PrismaClientValidationError(
      'Invalid `prisma.invoice.create()` invocation: data: { supplierName: "CONFIDENTIAL-SUPPLIER", totalAmount: 9120.5 }',
      { clientVersion: 'test' },
    );

    const cleaned = withoutSensitiveDetails(leaky);

    expect(cleaned).toBeInstanceOf(Error);
    expect((cleaned as Error).message).not.toContain('CONFIDENTIAL');
    expect((cleaned as Error).message).not.toContain('9120.5');
    expect((cleaned as Error).stack).not.toContain('CONFIDENTIAL');
  });

  it.each([
    ['a plain error', new Error('boom')],
    ['a Prisma error that carries no request data', new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })],
    ['a string', 'text'],
    ['null', null],
  ])('leaves %s alone, so diagnostics are kept', (_label, value) => {
    expect(withoutSensitiveDetails(value)).toBe(value);
  });
});
