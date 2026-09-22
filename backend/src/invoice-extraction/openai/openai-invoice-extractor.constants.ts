// gpt-4o-mini supports strict JSON-schema structured outputs at low cost and
// latency, which is all this call needs. Its 128k-token context window
// comfortably fits our PDF text cap (20,000 chars, ~5k tokens) plus prompt
// and schema overhead.
export const OPENAI_MODEL = 'gpt-4o-mini';

export const OPENAI_REQUEST_TIMEOUT_MS = 30_000;
export const OPENAI_MAX_RETRIES = 2;

export const INVOICE_EXTRACTION_SYSTEM_PROMPT = `You are an invoice data extraction assistant. You will be given the raw text extracted from an invoice PDF. Extract exactly these fields:
- supplierName: the name of the company or person who issued the invoice.
- invoiceNumber: the invoice's identifying number or reference.
- issueDate: the invoice's issue date, formatted as YYYY-MM-DD.
- totalAmount: the total amount due, as a plain number (no currency symbols or thousands separators).
- currency: the 3-letter ISO 4217 currency code (e.g. USD, EUR, BRL). Infer it from context (symbols, amounts, or language) if it is not stated explicitly.
- items: the line items, each with description, quantity, unitPrice, and totalPrice as plain numbers.

Only use information present in the provided text. Do not invent supplier names, invoice numbers, or amounts. If a line item's numeric fields are not explicit, compute them from the visible quantity and price when possible.`;

// Mirrors extracted-invoice.schema.ts (Zod). Keep both in sync: this is what
// constrains the model's output; the Zod schema is what we actually trust.
export const INVOICE_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    supplierName: { type: 'string' },
    invoiceNumber: { type: 'string' },
    issueDate: { type: 'string', description: 'ISO 8601 date, formatted as YYYY-MM-DD' },
    totalAmount: { type: 'number' },
    currency: { type: 'string', description: 'ISO 4217 currency code, e.g. USD' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          quantity: { type: 'number' },
          unitPrice: { type: 'number' },
          totalPrice: { type: 'number' },
        },
        required: ['description', 'quantity', 'unitPrice', 'totalPrice'],
        additionalProperties: false,
      },
    },
  },
  required: ['supplierName', 'invoiceNumber', 'issueDate', 'totalAmount', 'currency', 'items'],
  additionalProperties: false,
};
