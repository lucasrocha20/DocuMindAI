import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { listDocuments } from '../api/documents';
import { listInvoices } from '../api/invoices';
import type { InvoiceSummary, PaginatedInvoices, UploadedDocument } from '../api/types';
import { DashboardPage } from './DashboardPage';

vi.mock('../api/documents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/documents')>()),
  listDocuments: vi.fn(),
  uploadDocument: vi.fn(),
}));
vi.mock('../api/invoices', () => ({ listInvoices: vi.fn(), getInvoice: vi.fn() }));

const document = (overrides: Partial<UploadedDocument> = {}): UploadedDocument => ({
  id: 'doc-1',
  filename: 'acme.pdf',
  status: 'COMPLETED',
  errorMessage: null,
  invoiceId: null,
  createdAt: '2026-09-20T12:00:00.000Z',
  updatedAt: '2026-09-20T12:00:00.000Z',
  ...overrides,
});

const invoice = (overrides: Partial<InvoiceSummary> = {}): InvoiceSummary => ({
  id: 'inv-1',
  documentId: 'doc-1',
  supplierName: 'Acme Robotics Ltd.',
  invoiceNumber: 'INV-2024-1042',
  issueDate: '2026-09-10',
  totalAmount: '122.50',
  currency: 'BRL',
  createdAt: '2026-09-20T12:00:00.000Z',
  ...overrides,
});

function invoicePage(data: InvoiceSummary[], { total = data.length, page = 1 } = {}): PaginatedInvoices {
  return { data, meta: { page, pageSize: 10, total, totalPages: Math.ceil(total / 10) } };
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

const documents = vi.mocked(listDocuments);
const invoices = vi.mocked(listInvoices);

describe('DashboardPage', () => {
  beforeEach(() => {
    documents.mockReset().mockResolvedValue([]);
    invoices.mockReset().mockResolvedValue(invoicePage([]));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows uploads with a status each, including why a failed one failed, and links invoices to their page', async () => {
    documents.mockResolvedValue([
      document({ id: 'a', filename: 'queued.pdf', status: 'PENDING' }),
      document({ id: 'b', filename: 'reading.pdf', status: 'PROCESSING' }),
      document({ id: 'c', filename: 'scan.pdf', status: 'FAILED', errorMessage: 'No extractable text was found in this PDF.' }),
      document({ id: 'd', filename: 'done.pdf', status: 'COMPLETED' }),
    ]);
    invoices.mockResolvedValue(invoicePage([invoice()]));

    renderDashboard();

    const uploads = await screen.findByRole('table', { name: /Uploaded documents/ });
    for (const label of ['Pending', 'Processing', 'Failed', 'Completed']) {
      expect(within(uploads).getByText(label)).toBeTruthy();
    }
    expect(within(uploads).getByText('No extractable text was found in this PDF.')).toBeTruthy();

    const link = await screen.findByRole('link', { name: /Acme Robotics Ltd\./ });
    expect(link.getAttribute('href')).toBe('/invoices/inv-1');
    expect(screen.getByText('1 invoice')).toBeTruthy();
  });

  it('links a completed upload straight to its invoice, and only then', async () => {
    documents.mockResolvedValue([
      document({ id: 'a', filename: 'done.pdf', status: 'COMPLETED', invoiceId: 'inv-7' }),
      document({ id: 'b', filename: 'busy.pdf', status: 'PROCESSING' }),
      document({ id: 'c', filename: 'broken.pdf', status: 'FAILED', errorMessage: 'No extractable text was found in this PDF.' }),
    ]);

    renderDashboard();

    const uploads = await screen.findByRole('table', { name: /Uploaded documents/ });
    const link = within(uploads).getByRole('link', { name: 'View invoice from done.pdf' });
    expect(link.getAttribute('href')).toBe('/invoices/inv-7');
    expect(within(uploads).getAllByRole('link')).toHaveLength(1);
  });

  it('shows loading states, then the empty states', async () => {
    renderDashboard();

    expect(screen.getByText('Loading uploads…')).toBeTruthy();
    expect(screen.getByText('Loading invoices…')).toBeTruthy();
    expect(await screen.findByText('No uploads yet')).toBeTruthy();
    expect(await screen.findByText('No invoices yet')).toBeTruthy();
  });

  it('shows an error with Try again, and recovers', async () => {
    const user = userEvent.setup();
    invoices.mockRejectedValueOnce(new ApiError("Can't reach the server.", null)).mockResolvedValue(invoicePage([invoice()]));

    renderDashboard();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Couldn't load invoices");
    expect(alert.textContent).toContain("Can't reach the server.");

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('link', { name: /Acme Robotics Ltd\./ })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('searches by supplier and invoice number, starting again from page 1', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText('No invoices yet');

    await user.type(screen.getByLabelText('Supplier'), '  acme ');
    await user.type(screen.getByLabelText('Invoice number'), 'INV-9');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await screen.findByRole('button', { name: 'Clear search' });
    expect(invoices).toHaveBeenLastCalledWith(
      { page: 1, pageSize: 10, supplierName: 'acme', invoiceNumber: 'INV-9' },
      expect.any(AbortSignal),
    );
  });

  it('pages through invoices, and blocks Next on the last page', async () => {
    const user = userEvent.setup();
    invoices.mockImplementation(async ({ page }) =>
      invoicePage([invoice({ id: `inv-${page}`, supplierName: `Supplier ${page}` })], { total: 25, page }),
    );
    renderDashboard();

    expect(await screen.findByText('Page 1 of 3')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Page 2 of 3')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Page 3 of 3')).toBeTruthy();

    expect(invoices).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3 }), expect.any(AbortSignal));
    expect(screen.getByRole('button', { name: 'Next' }).getAttribute('aria-disabled')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Page 3 of 3')).toBeTruthy();
  });

  it('collapses a long uploads list to the latest 8 and expands on request', async () => {
    const user = userEvent.setup();
    documents.mockResolvedValue(Array.from({ length: 10 }, (_, index) => document({ id: `d${index}`, filename: `file-${index}.pdf` })));
    renderDashboard();

    const table = await screen.findByRole('table', { name: /Uploaded documents/ });
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 8);

    const toggle = screen.getByRole('button', { name: 'Show all 10 uploads' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle);

    expect(within(table).getAllByRole('row')).toHaveLength(1 + 10);
    expect(screen.getByRole('button', { name: 'Show fewer uploads' }).getAttribute('aria-expanded')).toBe('true');
  });

  describe('while documents are being processed', () => {
    it('polls for status changes and refreshes the invoice list when one completes, then stops polling', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      documents
        .mockResolvedValueOnce([document({ status: 'PENDING' })])
        .mockResolvedValue([document({ status: 'COMPLETED' })]);
      invoices.mockResolvedValueOnce(invoicePage([])).mockResolvedValue(invoicePage([invoice()]));

      renderDashboard();
      await screen.findByText('Pending');
      expect(invoices).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      expect(await screen.findByText('Completed')).toBeTruthy();
      expect(await screen.findByRole('link', { name: /Acme Robotics Ltd\./ })).toBeTruthy();
      expect(invoices).toHaveBeenCalledTimes(2);

      const callsWhenSettled = documents.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });
      expect(documents.mock.calls.length).toBe(callsWhenSettled);
    });

    it('keeps polling every few seconds while something is still processing', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      documents.mockResolvedValue([document({ status: 'PROCESSING' })]);

      renderDashboard();
      await screen.findByText('Processing');
      const initialCalls = documents.mock.calls.length;

      // One interval per act(): React batches every update inside a single act into one render.
      for (let tick = 0; tick < 3; tick++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000);
        });
      }

      expect(documents.mock.calls.length).toBe(initialCalls + 3);
    });

    it('does not poll when nothing is processing', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      documents.mockResolvedValue([document({ status: 'COMPLETED' }), document({ id: 'x', status: 'FAILED' })]);

      renderDashboard();
      await screen.findAllByText(/Completed|Failed/);
      const initialCalls = documents.mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });

      expect(documents.mock.calls.length).toBe(initialCalls);
    });
  });
});
