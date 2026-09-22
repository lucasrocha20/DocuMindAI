export type DocumentStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface UploadedDocument {
  id: string;
  filename: string;
  status: DocumentStatus;
  errorMessage: string | null;
  // Set once an invoice has been extracted from this document.
  invoiceId: string | null;
  createdAt: string;
  updatedAt: string;
}

// Money and quantities arrive as fixed-scale decimal strings (e.g. "122.50").
export interface InvoiceSummary {
  id: string;
  documentId: string;
  supplierName: string;
  invoiceNumber: string;
  issueDate: string;
  totalAmount: string;
  currency: string;
  createdAt: string;
}

export interface InvoiceItem {
  description: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
}

export interface InvoiceDetail extends InvoiceSummary {
  updatedAt: string;
  items: InvoiceItem[];
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedInvoices {
  data: InvoiceSummary[];
  meta: PaginationMeta;
}
