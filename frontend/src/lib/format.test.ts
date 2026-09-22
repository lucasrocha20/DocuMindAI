import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatIssueDate, formatMoney, formatQuantity } from './format';

// Formatting follows the browser locale, so assertions accept either the
// en-US or pt-BR separator style instead of pinning one locale.
describe('formatIssueDate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['America/Los_Angeles', 'UTC', 'Pacific/Kiritimati'])(
    'shows the calendar day as written, in any time zone (%s)',
    (timeZone) => {
      vi.stubEnv('TZ', timeZone);

      // A naive local-time conversion shows Sep 9 for UTC-negative zones.
      expect(formatIssueDate('2026-09-10')).toMatch(/\b10\b/);
      expect(formatIssueDate('2026-09-10')).toMatch(/2026/);
    },
  );
});

describe('formatMoney', () => {
  it('formats with the currency and two decimals', () => {
    expect(formatMoney('122.50', 'BRL')).toMatch(/R\$\s?122[.,]50/);
    expect(formatMoney('4310.00', 'USD')).toMatch(/4[.,\s]?310[.,]00/);
  });

  it('still shows the amount when the currency code is not one Intl accepts', () => {
    expect(formatMoney('122.5', 'ZZ')).toBe('ZZ 122.50');
  });
});

describe('formatQuantity', () => {
  it('drops the padding zeros the API adds', () => {
    expect(formatQuantity('5.000')).toBe('5');
    expect(formatQuantity('2.500')).toMatch(/^2[.,]5$/);
    expect(formatQuantity('0.125')).toMatch(/^0[.,]125$/);
  });
});
