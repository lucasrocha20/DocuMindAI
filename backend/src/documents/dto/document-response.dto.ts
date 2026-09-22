import type { Document, DocumentStatus } from '../../generated/prisma/client.js';

export interface DocumentResponseDto {
  id: string;
  filename: string;
  status: DocumentStatus;
  errorMessage: string | null;
  // Set once processing has produced an invoice, so clients can link to it.
  invoiceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toDocumentResponse(document: Document & { invoice?: { id: string } | null }): DocumentResponseDto {
  return {
    id: document.id,
    filename: document.filename,
    status: document.status,
    errorMessage: document.errorMessage,
    invoiceId: document.invoice?.id ?? null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}
