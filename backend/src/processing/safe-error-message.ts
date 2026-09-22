import { InvoiceExtractionError } from '../invoice-extraction/invoice-extraction.errors.js';
import { PdfExtractionError } from '../pdf/pdf-extraction.errors.js';

const MAX_ERROR_MESSAGE_LENGTH = 500;
const GENERIC_MESSAGE = 'Processing failed because of an unexpected error. Try uploading the document again.';

/**
 * The message stored on a failed Document is returned by the API, so it must
 * be safe to show. Only our own typed errors carry messages written for that;
 * anything else (fs, Prisma, SDK, libraries) can embed file paths, SQL, or
 * connection details, so it is replaced by a generic message. The full error
 * is logged server-side by the caller.
 */
export function toSafeErrorMessage(error: unknown): string {
  if (error instanceof PdfExtractionError || error instanceof InvoiceExtractionError) {
    return error.message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
  }
  return GENERIC_MESSAGE;
}
