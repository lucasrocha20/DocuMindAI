import { getJson } from './client';
import type { InvoiceDetail, PaginatedInvoices } from './types';

export interface ListInvoicesParams {
  page: number;
  pageSize: number;
  supplierName?: string;
  invoiceNumber?: string;
}

export function listInvoices(params: ListInvoicesParams, signal?: AbortSignal): Promise<PaginatedInvoices> {
  const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
  if (params.supplierName) query.set('supplierName', params.supplierName);
  if (params.invoiceNumber) query.set('invoiceNumber', params.invoiceNumber);
  return getJson<PaginatedInvoices>(`/invoices?${query}`, signal);
}

export function getInvoice(id: string, signal?: AbortSignal): Promise<InvoiceDetail> {
  return getJson<InvoiceDetail>(`/invoices/${encodeURIComponent(id)}`, signal);
}
