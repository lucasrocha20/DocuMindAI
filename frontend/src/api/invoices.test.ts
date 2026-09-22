import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getInvoice, listInvoices } from './invoices';

describe('invoices API', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const requestedUrl = () => new URL(fetchMock.mock.calls[0][0] as string);

  it('sends page and pageSize, and leaves out filters that are not set', async () => {
    await listInvoices({ page: 2, pageSize: 10 });

    const url = requestedUrl();
    expect(url.pathname).toBe('/invoices');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('pageSize')).toBe('10');
    expect(url.searchParams.has('supplierName')).toBe(false);
    expect(url.searchParams.has('invoiceNumber')).toBe(false);
  });

  it('does not send blank filters', async () => {
    await listInvoices({ page: 1, pageSize: 10, supplierName: '', invoiceNumber: '' });

    expect([...requestedUrl().searchParams.keys()].sort()).toEqual(['page', 'pageSize']);
  });

  it('encodes filter values, so characters like & and % cannot alter the query', async () => {
    await listInvoices({ page: 1, pageSize: 10, supplierName: 'A&B 100%', invoiceNumber: 'INV #1' });

    expect(requestedUrl().searchParams.get('supplierName')).toBe('A&B 100%');
    expect(requestedUrl().searchParams.get('invoiceNumber')).toBe('INV #1');
    expect([...requestedUrl().searchParams.keys()].sort()).toEqual(['invoiceNumber', 'page', 'pageSize', 'supplierName']);
  });

  it('encodes the invoice id in the path', async () => {
    await getInvoice('a/b?c');

    expect(requestedUrl().pathname).toBe('/invoices/a%2Fb%3Fc');
  });
});
