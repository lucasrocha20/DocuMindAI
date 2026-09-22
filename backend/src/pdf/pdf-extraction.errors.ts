export type PdfExtractionErrorReason = 'INVALID_PDF' | 'INSUFFICIENT_TEXT' | 'TOO_MANY_PAGES';

/**
 * Raised for PDFs that cannot be turned into usable invoice text: malformed
 * files, or documents with no extractable text layer (e.g. scanned/image
 * invoices - OCR is not implemented yet).
 */
export class PdfExtractionError extends Error {
  constructor(
    message: string,
    readonly reason: PdfExtractionErrorReason,
  ) {
    super(message);
    this.name = 'PdfExtractionError';
  }
}
