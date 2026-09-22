import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { getInvoice } from '../api/invoices';
import type { InvoiceDetail } from '../api/types';
import { InvoiceDetailPage } from './InvoiceDetailPage';

vi.mock('../api/invoices', () => ({ listInvoices: vi.fn(), getInvoice: vi.fn() }));

const detail: InvoiceDetail = {
  id: 'inv-1',
  documentId: 'doc-1',
  supplierName: 'Acme Robotics Ltd.',
  invoiceNumber: 'INV-2024-1042',
  issueDate: '2026-09-10',
  totalAmount: '122.50',
  currency: 'BRL',
  createdAt: '2026-09-20T12:00:00.000Z',
  updatedAt: '2026-09-20T12:00:00.000Z',
  items: [
    { description: 'Widget A, anodised aluminium', quantity: '5.000', unitPrice: '12.50', totalPrice: '62.50' },
    { description: 'Widget B', quantity: '2.500', unitPrice: '24.00', totalPrice: '60.00' },
  ],
};

const fetchInvoice = vi.mocked(getInvoice);

function renderPage(id = 'inv-1') {
  return render(
    <MemoryRouter initialEntries={[`/invoices/${id}`]}>
      <Routes>
        <Route path="invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="/" element={<p>dashboard</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('InvoiceDetailPage', () => {
  beforeEach(() => {
    fetchInvoice.mockReset();
  });

  it('shows supplier, invoice number, issue date, currency, every line item, and the total', async () => {
    fetchInvoice.mockResolvedValue(detail);

    renderPage();

    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Acme Robotics Ltd.');
    expect(screen.getByText('INV-2024-1042')).toBeTruthy();
    expect(screen.getByText(/Sep 10, 2026|10 de set/)).toBeTruthy();
    expect(screen.getByText('BRL')).toBeTruthy();

    const items = screen.getByRole('table', { name: 'Line items on this invoice' });
    expect(within(items).getAllByRole('row')).toHaveLength(1 + 2);
    expect(within(items).getByText('Widget A, anodised aluminium')).toBeTruthy();
    expect(within(items).getByText('Widget B')).toBeTruthy();
    // The total is outside the table, so it stays visible on narrow screens.
    expect(screen.getByText('Total').closest('dl')?.textContent).toMatch(/122[.,]50/);
    expect(fetchInvoice).toHaveBeenCalledWith('inv-1', expect.any(AbortSignal));
  });

  it('shows a loading state first', () => {
    fetchInvoice.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText('Loading invoice…')).toBeTruthy();
  });

  it('says so when the invoice has no line items', async () => {
    fetchInvoice.mockResolvedValue({ ...detail, items: [] });

    renderPage();

    expect(await screen.findByText('No line items were extracted from this invoice.')).toBeTruthy();
  });

  it.each([404, 400])('shows a not-found message when the API answers %i', async (status) => {
    fetchInvoice.mockRejectedValue(new ApiError('Invoice not found', status));

    renderPage('nope');

    expect(await screen.findByRole('heading', { name: 'Invoice not found' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows other failures as an error with Try again, and recovers', async () => {
    const user = userEvent.setup();
    fetchInvoice.mockRejectedValueOnce(new ApiError('The server responded with status 500.', 500)).mockResolvedValue(detail);

    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The server responded with status 500.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Acme Robotics Ltd.' })).toBeTruthy();
  });

  it('links back to the dashboard', async () => {
    const user = userEvent.setup();
    fetchInvoice.mockResolvedValue(detail);
    renderPage();

    await user.click(await screen.findByRole('link', { name: 'Back to dashboard' }));

    expect(screen.getByText('dashboard')).toBeTruthy();
  });
});
