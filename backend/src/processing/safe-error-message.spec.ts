import { describe, expect, it } from 'vitest';
import { InvoiceExtractionError } from '../invoice-extraction/invoice-extraction.errors.js';
import { PdfExtractionError } from '../pdf/pdf-extraction.errors.js';
import { toSafeErrorMessage } from './safe-error-message.js';

describe('toSafeErrorMessage', () => {
  it('passes through the curated messages of our own typed errors', () => {
    expect(toSafeErrorMessage(new PdfExtractionError('The file could not be read as a valid PDF document.', 'INVALID_PDF'))).toBe(
      'The file could not be read as a valid PDF document.',
    );
    expect(toSafeErrorMessage(new InvoiceExtractionError('The extraction provider timed out.', 'TIMEOUT'))).toBe(
      'The extraction provider timed out.',
    );
  });

  it('caps the length of a typed error message', () => {
    expect(toSafeErrorMessage(new PdfExtractionError('x'.repeat(2000), 'INVALID_PDF'))).toHaveLength(500);
  });

  it.each([
    ['a filesystem error with a path', new Error("ENOENT: no such file or directory, open '/srv/app/uploads/abc.pdf'")],
    ['a database error with connection details', new Error('connection to server at "10.0.0.5", port 5432 failed')],
    ['a plain string', 'password=hunter2'],
    ['an object', { token: 'secret' }],
    ['null', null],
    ['undefined', undefined],
  ])('replaces %s with a generic message that reveals nothing', (_label, thrown) => {
    const message = toSafeErrorMessage(thrown);

    expect(message).toBe('Processing failed because of an unexpected error. Try uploading the document again.');
  });
});
