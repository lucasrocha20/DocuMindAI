export type InvoiceExtractionErrorReason =
  | 'INVALID_RESPONSE'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'AUTH_ERROR'
  | 'PROVIDER_ERROR';

/**
 * Uniform, provider-agnostic failure surfaced by any InvoiceExtractor
 * implementation. Never carries the raw invoice text or provider
 * credentials - only a safe message plus the original error as `cause`
 * for server-side diagnostics.
 */
export class InvoiceExtractionError extends Error {
  constructor(
    message: string,
    readonly reason: InvoiceExtractionErrorReason,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'InvoiceExtractionError';
  }
}
