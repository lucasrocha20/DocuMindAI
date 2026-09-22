export const INVOICE_PROCESSING_QUEUE = 'invoice-processing';
export const PROCESS_INVOICE_JOB = 'process-invoice';

export interface ProcessInvoiceJobData {
  documentId: string;
}
