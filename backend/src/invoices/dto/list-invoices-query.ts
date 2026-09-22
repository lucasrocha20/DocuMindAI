import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

// A blank filter (e.g. a cleared search box sending `supplierName=`) means "no filter".
const optionalFilter = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .optional()
    .transform((value) => value || undefined);

export const listInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  supplierName: optionalFilter(255),
  invoiceNumber: optionalFilter(100),
});

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
