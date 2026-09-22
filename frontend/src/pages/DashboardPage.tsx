import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { listDocuments } from '../api/documents';
import { listInvoices } from '../api/invoices';
import type { DocumentStatus } from '../api/types';
import { DocumentsSection } from '../components/DocumentsSection';
import { InvoicesSection, type InvoiceFilters } from '../components/InvoicesSection';
import { UploadPanel } from '../components/UploadPanel';
import { useApi } from '../hooks/useApi';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const PAGE_SIZE = 10;
const POLL_INTERVAL_MS = 3000;

export function DashboardPage() {
  useDocumentTitle('Dashboard');

  // Search and page live in the URL, so going back from an invoice restores them.
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const filters: InvoiceFilters = {
    supplierName: searchParams.get('supplierName') ?? '',
    invoiceNumber: searchParams.get('invoiceNumber') ?? '',
  };

  const documents = useApi(listDocuments, 'documents');
  const invoices = useApi(
    (signal) => listInvoices({ page, pageSize: PAGE_SIZE, ...filters }, signal),
    `invoices|${page}|${filters.supplierName}|${filters.invoiceNumber}`,
  );

  // Poll only while something is still being processed.
  const hasActiveDocuments = documents.data?.some(
    (document) => document.status === 'PENDING' || document.status === 'PROCESSING',
  );
  const reloadDocuments = documents.reload;
  useEffect(() => {
    if (!hasActiveDocuments) return;
    const timer = setInterval(reloadDocuments, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasActiveDocuments, reloadDocuments]);

  // A document finishing means a new invoice exists, so refresh the invoice list.
  const previousStatuses = useRef(new Map<string, DocumentStatus>());
  const reloadInvoices = invoices.reload;
  useEffect(() => {
    if (!documents.data) return;
    const previous = previousStatuses.current;
    const justCompleted = documents.data.some(
      (document) =>
        document.status === 'COMPLETED' && previous.has(document.id) && previous.get(document.id) !== 'COMPLETED',
    );
    previousStatuses.current = new Map(documents.data.map((document) => [document.id, document.status]));
    if (justCompleted) reloadInvoices();
  }, [documents.data, reloadInvoices]);

  function updateParams(changes: Record<string, string>) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      for (const [name, value] of Object.entries(changes)) {
        if (value === '' || (name === 'page' && value === '1')) next.delete(name);
        else next.set(name, value);
      }
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Dashboard</h1>
      <UploadPanel onUploaded={reloadDocuments} />
      <DocumentsSection resource={documents} />
      <InvoicesSection
        resource={invoices}
        filters={filters}
        page={page}
        onSearch={(next) => updateParams({ ...next, page: '1' })}
        onPageChange={(nextPage) => updateParams({ page: String(nextPage) })}
      />
    </div>
  );
}
