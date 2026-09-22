import type { FormEvent } from 'react';
import { Link } from 'react-router';
import type { PaginatedInvoices } from '../api/types';
import type { ApiResource } from '../hooks/useApi';
import { formatIssueDate, formatMoney } from '../lib/format';
import { Pagination } from './Pagination';
import { EmptyState, ErrorState, LoadingState } from './StateMessages';

export interface InvoiceFilters {
  supplierName: string;
  invoiceNumber: string;
}

interface InvoicesSectionProps {
  resource: ApiResource<PaginatedInvoices>;
  filters: InvoiceFilters;
  onSearch: (filters: InvoiceFilters) => void;
  page: number;
  onPageChange: (page: number) => void;
}

export function InvoicesSection({ resource, filters, onSearch, page, onPageChange }: InvoicesSectionProps) {
  const { data, error, loading, reload } = resource;
  const hasFilters = filters.supplierName !== '' || filters.invoiceNumber !== '';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSearch({
      supplierName: String(form.get('supplierName') ?? '').trim(),
      invoiceNumber: String(form.get('invoiceNumber') ?? '').trim(),
    });
  }

  return (
    <section aria-labelledby="invoices-heading" aria-busy={loading} className="sheet overflow-hidden">
      <h2 id="invoices-heading" className="px-5 pt-5 text-xl font-semibold sm:px-6">
        Extracted invoices
      </h2>

      {/* Remounted when the URL filters change so the inputs always match them. */}
      <form
        key={`${filters.supplierName}|${filters.invoiceNumber}`}
        role="search"
        aria-label="Search invoices"
        onSubmit={handleSubmit}
        className="flex flex-wrap items-end gap-3 px-5 pb-4 pt-3 sm:px-6"
      >
        <div className="min-w-44 flex-1">
          <label htmlFor="filter-supplier" className="mb-1 block text-sm font-medium">
            Supplier
          </label>
          <input
            id="filter-supplier"
            name="supplierName"
            type="search"
            maxLength={255}
            defaultValue={filters.supplierName}
            className="field"
          />
        </div>
        <div className="min-w-44 flex-1">
          <label htmlFor="filter-number" className="mb-1 block text-sm font-medium">
            Invoice number
          </label>
          <input
            id="filter-number"
            name="invoiceNumber"
            type="search"
            maxLength={100}
            defaultValue={filters.invoiceNumber}
            className="field"
          />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">
            Search
          </button>
          {hasFilters && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onSearch({ supplierName: '', invoiceNumber: '' })}
            >
              Clear search
            </button>
          )}
        </div>
      </form>

      {error && (
        <ErrorState
          inline={data !== null}
          title="Couldn't load invoices"
          message={error.message}
          onRetry={reload}
        />
      )}

      {!data && !error && <LoadingState label="Loading invoices…" />}

      {/* With no results the empty state below says it; this stays for screen readers. */}
      {data && (
        <p
          role="status"
          className={data.meta.total === 0 ? 'sr-only' : 'border-t border-rule px-5 py-2 text-sm text-graphite sm:px-6'}
        >
          {data.meta.total === 0
            ? 'No invoices found.'
            : `${data.meta.total} ${data.meta.total === 1 ? 'invoice' : 'invoices'}${hasFilters ? ' match your search' : ''}`}
        </p>
      )}

      {data && data.meta.total === 0 && !hasFilters && (
        <EmptyState title="No invoices yet">
          Invoices appear here once an uploaded PDF has finished processing.
        </EmptyState>
      )}

      {data && data.meta.total === 0 && hasFilters && (
        <EmptyState title="Nothing matches that search">
          Check the spelling or try a shorter part of the name or number.
        </EmptyState>
      )}

      {data && data.meta.total > 0 && data.data.length === 0 && (
        <EmptyState title="There are no invoices on this page">
          <button type="button" className="btn btn-secondary mt-2" onClick={() => onPageChange(1)}>
            Go to the first page
          </button>
        </EmptyState>
      )}

      {data && data.data.length > 0 && (
        <table className="w-full border-t border-rule text-left text-[15px]">
          <caption className="sr-only">Extracted invoices, newest first</caption>
          <thead className="bg-blotter/40 text-graphite">
            <tr>
              <th scope="col" className="px-5 py-2 font-medium sm:px-6">Supplier</th>
              <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">Invoice number</th>
              <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">Issue date</th>
              <th scope="col" className="px-5 py-2 text-right font-medium sm:px-6">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((invoice) => (
              <tr key={invoice.id} className="border-t border-rule align-top">
                <th scope="row" className="break-words px-5 py-3 font-medium sm:px-6">
                  <Link to={`/invoices/${invoice.id}`} className="text-pen underline underline-offset-2 hover:text-pen-dark">
                    {invoice.supplierName}
                    <span className="sr-only">, invoice {invoice.invoiceNumber}</span>
                  </Link>
                  {/* On narrow screens number and date move under the name so Total stays visible. */}
                  <p className="mt-0.5 text-sm font-normal text-graphite sm:hidden">
                    {invoice.invoiceNumber}
                    <br />
                    <time dateTime={invoice.issueDate}>{formatIssueDate(invoice.issueDate)}</time>
                  </p>
                </th>
                <td className="hidden px-3 py-3 sm:table-cell">{invoice.invoiceNumber}</td>
                <td className="hidden whitespace-nowrap px-3 py-3 sm:table-cell">
                  <time dateTime={invoice.issueDate}>{formatIssueDate(invoice.issueDate)}</time>
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums sm:px-6">
                  {formatMoney(invoice.totalAmount, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {data && data.meta.totalPages > 1 && (
        <Pagination
          label="Invoice pages"
          page={page}
          totalPages={data.meta.totalPages}
          onPageChange={onPageChange}
        />
      )}
    </section>
  );
}
