import { describe, expect, it } from 'vitest';
import { sanitizeFilename } from './sanitize-filename.js';

describe('sanitizeFilename', () => {
  it('keeps a normal filename as-is', () => {
    expect(sanitizeFilename('invoice.pdf')).toBe('invoice.pdf');
  });

  it('strips directory components from a path traversal attempt', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
  });

  it('strips a null-byte / traversal payload embedded in the name', () => {
    expect(sanitizeFilename('..%2f..%2fetc%2fpasswd.pdf')).toBe('.._2f.._2fetc_2fpasswd.pdf');
  });

  it('replaces unsafe characters', () => {
    expect(sanitizeFilename('inv oice*<>?.pdf')).toBe('inv_oice____.pdf');
  });

  it('falls back to a default name when empty or undefined', () => {
    expect(sanitizeFilename('')).toBe('document.pdf');
    expect(sanitizeFilename(undefined)).toBe('document.pdf');
  });

  it('caps very long filenames', () => {
    const longName = `${'a'.repeat(300)}.pdf`;
    expect(sanitizeFilename(longName).length).toBeLessThanOrEqual(255);
  });
});
