import { useState } from 'react';
import { Link } from 'react-router';
import type { UploadedDocument } from '../api/types';
import type { ApiResource } from '../hooks/useApi';
import { formatDateTime } from '../lib/format';
import { EmptyState, ErrorState, LoadingState } from './StateMessages';
import { StatusBadge } from './StatusBadge';

// Newest first, so the collapsed view always shows the latest uploads and
// keeps the invoices below within reach.
const COLLAPSED_ROWS = 8;

export function DocumentsSection({ resource }: { resource: ApiResource<UploadedDocument[]> }) {
  const { data, error, loading, reload } = resource;
  const [showAll, setShowAll] = useState(false);

  const canCollapse = data !== null && data.length > COLLAPSED_ROWS;
  const rows = data && canCollapse && !showAll ? data.slice(0, COLLAPSED_ROWS) : data;

  return (
    <section aria-labelledby="documents-heading" aria-busy={loading} className="sheet overflow-hidden">
      <h2 id="documents-heading" className="px-5 pt-5 text-xl font-semibold sm:px-6">
        Recent uploads
      </h2>
      <p className="px-5 pb-4 pt-1 text-sm text-graphite sm:px-6">
        Each PDF is read in the background. This list updates on its own while files are being processed.
      </p>

      {error && (
        <ErrorState
          inline={data !== null}
          title="Couldn't load uploads"
          message={error.message}
          onRetry={reload}
        />
      )}

      {!data && !error && <LoadingState label="Loading uploads…" />}

      {data && data.length === 0 && (
        <EmptyState title="No uploads yet">Upload an invoice PDF above to get started.</EmptyState>
      )}

      {rows && rows.length > 0 && (
        <table id="documents-table" className="w-full border-t border-rule text-left text-[15px]">
          <caption className="sr-only">Uploaded documents and their processing status</caption>
          <thead className="bg-blotter/40 text-graphite">
            <tr>
              <th scope="col" className="px-5 py-2 font-medium sm:px-6">File</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="hidden px-5 py-2 text-right font-medium sm:table-cell sm:px-6">Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((document) => (
              <tr key={document.id} className="border-t border-rule align-top">
                <th scope="row" className="break-words px-5 py-3 font-medium sm:px-6">
                  {document.filename}
                  {/* On narrow screens the time moves under the name so the table keeps two columns. */}
                  <p className="mt-0.5 text-sm font-normal text-graphite sm:hidden">
                    <time dateTime={document.createdAt}>{formatDateTime(document.createdAt)}</time>
                  </p>
                  {document.status === 'FAILED' && document.errorMessage && (
                    <p className="mt-1 text-sm font-normal text-failed-fg">{document.errorMessage}</p>
                  )}
                  {document.invoiceId && (
                    <p className="mt-1 text-sm font-normal">
                      <Link
                        to={`/invoices/${document.invoiceId}`}
                        className="text-pen underline underline-offset-2 hover:text-pen-dark"
                      >
                        View invoice{' '}
                        <span className="sr-only">from {document.filename}</span>
                      </Link>
                    </p>
                  )}
                </th>
                <td className="px-3 py-3">
                  <StatusBadge status={document.status} />
                </td>
                <td className="hidden whitespace-nowrap px-5 py-3 text-right text-graphite sm:table-cell sm:px-6">
                  <time dateTime={document.createdAt}>{formatDateTime(document.createdAt)}</time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canCollapse && (
        <div className="border-t border-rule px-5 py-3 sm:px-6">
          <button
            type="button"
            className="btn btn-secondary"
            aria-expanded={showAll}
            aria-controls="documents-table"
            onClick={() => setShowAll((current) => !current)}
          >
            {showAll ? 'Show fewer uploads' : `Show all ${data.length} uploads`}
          </button>
        </div>
      )}
    </section>
  );
}
