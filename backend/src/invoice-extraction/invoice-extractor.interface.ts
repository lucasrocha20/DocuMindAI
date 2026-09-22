import type { ExtractedInvoiceData } from './extracted-invoice.schema.js';

export interface InvoiceExtractionMetadata {
  model: string;
  extractedAt: string;
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface InvoiceExtractionResult {
  data: ExtractedInvoiceData;
  metadata: InvoiceExtractionMetadata;
}

/**
 * Provider-agnostic contract for turning invoice PDF text into validated
 * structured data. Business logic (the future processing pipeline) depends
 * only on this interface, never on a specific provider's SDK types.
 */
export interface InvoiceExtractor {
  extract(pdfText: string): Promise<InvoiceExtractionResult>;
}

export const INVOICE_EXTRACTOR = Symbol('INVOICE_EXTRACTOR');
