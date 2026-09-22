import { z } from 'zod';

// Largest values the numeric(12,2) money columns and numeric(12,3) quantity
// column can hold (see prisma/schema.prisma). Bigger numbers would pass here
// and then fail at insert, so reject them as a bad AI response instead.
const MAX_MONEY = 9_999_999_999.99;
const MAX_QUANTITY = 999_999_999.999;

export const extractedInvoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().finite().positive().max(MAX_QUANTITY),
  unitPrice: z.number().finite().nonnegative().max(MAX_MONEY),
  totalPrice: z.number().finite().nonnegative().max(MAX_MONEY),
});

export const extractedInvoiceSchema = z.object({
  supplierName: z.string().trim().min(1).max(255),
  invoiceNumber: z.string().trim().min(1).max(100),
  issueDate: z.iso.date(),
  totalAmount: z.number().finite().nonnegative().max(MAX_MONEY),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'currency must be a 3-letter ISO 4217 code'),
  items: z.array(extractedInvoiceItemSchema).min(1).max(200),
});

export type ExtractedInvoiceItem = z.infer<typeof extractedInvoiceItemSchema>;
export type ExtractedInvoiceData = z.infer<typeof extractedInvoiceSchema>;
