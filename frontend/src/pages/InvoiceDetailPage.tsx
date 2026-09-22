import type { MouseEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { getInvoice } from '../api/invoices';
import type { InvoiceDetail } from '../api/types';
import { ErrorState, LoadingState } from '../components/StateMessages';
import { useApi } from '../hooks/useApi';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatIssueDate, formatMoney, formatQuantity } from '../lib/format';

// Goes back when there is somewhere to go back to (keeping the dashboard's
// search and page), otherwise falls through to a normal link to the dashboard.
function BackLink() {
  const navigate = useNavigate();
  const location = useLocation();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (location.key === 'default') return;
    event.preventDefault();
    void navigate(-1);
  }

  return (
    <Link to="/" onClick={handleClick} className="inline-block text-pen underline underline-offset-2 hover:text-pen-dark">
      Back to dashboard
    </Link>
  );
}

function InvoiceSheet({ invoice }: { invoice: InvoiceDetail }) {
  return (
    <article aria-labelledby="invoice-heading" className="invoice-sheet rounded-b bg-sheet px-4 pb-8 pt-9 sm:px-10">
      <header className="border-b border-rule pb-6">
        <p className="text-sm text-graphite">Supplier</p>
        <h1 id="invoice-heading" className="break-words text-3xl font-semibold">
          {invoice.supplierName}
        </h1>

        <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-graphite">Invoice number</dt>
            <dd className="break-words font-medium">{invoice.invoiceNumber}</dd>
          </div>
          <div>
            <dt className="text-sm text-graphite">Issue date</dt>
            <dd className="font-medium">
              <time dateTime={invoice.issueDate}>{formatIssueDate(invoice.issueDate)}</time>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-graphite">Currency</dt>
            <dd className="font-medium">{invoice.currency}</dd>
          </div>
        </dl>
      </header>

      <section aria-labelledby="items-heading" className="pt-6">
        <h2 id="items-heading" className="text-xl font-semibold">
          Line items
        </h2>

        {invoice.items.length === 0 ? (
          <p className="mt-3 text-graphite">No line items were extracted from this invoice.</p>
        ) : (
          <div role="region" aria-label="Line items table" tabIndex={0} className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm sm:text-[15px]">
              <caption className="sr-only">Line items on this invoice</caption>
              <thead className="text-graphite">
                <tr className="border-b border-ink">
                  <th scope="col" className="py-2 pr-2 font-medium sm:pr-3">Description</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium sm:px-3">Quantity</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium sm:px-3">Unit price</th>
                  <th scope="col" className="py-2 pl-2 text-right font-medium sm:pl-3">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, index) => (
                  <tr key={index} className="border-b border-rule align-top">
                    <th scope="row" className="break-words py-3 pr-2 font-normal sm:pr-3">{item.description}</th>
                    <td className="px-2 py-3 text-right tabular-nums sm:px-3">{formatQuantity(item.quantity)}</td>
                    <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums sm:px-3">
                      {formatMoney(item.unitPrice, invoice.currency)}
                    </td>
                    <td className="whitespace-nowrap py-3 pl-2 text-right tabular-nums sm:pl-3">
                      {formatMoney(item.totalPrice, invoice.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Outside the table so the total stays on screen however narrow it gets. */}
        <dl className="mt-5 flex items-baseline justify-end gap-6">
          <dt className="font-display text-lg font-semibold">Total</dt>
          <dd className="font-display text-2xl font-semibold tabular-nums">
            <span className="inline-block border-b-4 border-double border-ink pb-0.5">
              {formatMoney(invoice.totalAmount, invoice.currency)}
            </span>
          </dd>
        </dl>
      </section>

      <p className="mt-8 max-w-prose text-sm text-graphite">
        Extracted automatically from the uploaded PDF. Check the amounts against the original before you rely on them.
      </p>
    </article>
  );
}

export function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const invoice = useApi((signal) => getInvoice(id, signal), `invoice|${id}`);

  useDocumentTitle(invoice.data ? `${invoice.data.supplierName}, ${invoice.data.invoiceNumber}` : 'Invoice');

  const notFound = invoice.error instanceof ApiError && (invoice.error.status === 404 || invoice.error.status === 400);

  return (
    <div className="space-y-5">
      <BackLink />

      {!invoice.data && !invoice.error && (
        <div className="sheet">
          <LoadingState label="Loading invoice…" />
        </div>
      )}

      {notFound && (
        <div className="sheet px-5 py-10">
          <h1 className="text-2xl font-semibold">Invoice not found</h1>
          <p className="mt-2 text-graphite">
            It may have been removed, or the link is wrong. Go back to the dashboard to find it in the list.
          </p>
        </div>
      )}

      {invoice.error && !notFound && (
        <div className="sheet overflow-hidden">
          <ErrorState title="Couldn't load this invoice" message={invoice.error.message} onRetry={invoice.reload} />
        </div>
      )}

      {invoice.data && <InvoiceSheet invoice={invoice.data} />}
    </div>
  );
}
