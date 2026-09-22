import { ApiProperty } from '@nestjs/swagger';
import type { Invoice, InvoiceItem } from '../../generated/prisma/client.js';

export class InvoiceItemDto {
  @ApiProperty({ type: String, example: 'Widget A' })
  description: string;

  @ApiProperty({ type: String, example: '2.500', description: 'Decimal string, 3 decimal places' })
  quantity: string;

  @ApiProperty({ type: String, example: '12.50', description: 'Decimal string, 2 decimal places' })
  unitPrice: string;

  @ApiProperty({ type: String, example: '62.50', description: 'Decimal string, 2 decimal places' })
  totalPrice: string;
}

export class InvoiceSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'The uploaded document this invoice was extracted from' })
  documentId: string;

  @ApiProperty({ type: String, example: 'Acme Robotics Ltd.' })
  supplierName: string;

  @ApiProperty({ type: String, example: 'INV-2024-1042' })
  invoiceNumber: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-09-10' })
  issueDate: string;

  @ApiProperty({ type: String, example: '122.50', description: 'Decimal string, 2 decimal places' })
  totalAmount: string;

  @ApiProperty({ type: String, example: 'BRL', description: 'ISO 4217 currency code' })
  currency: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;
}

export class InvoiceDetailDto extends InvoiceSummaryDto {
  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: string;

  @ApiProperty({ type: () => [InvoiceItemDto] })
  items: InvoiceItemDto[];
}

export class PaginationMetaDto {
  @ApiProperty({ type: Number, example: 1 })
  page: number;

  @ApiProperty({ type: Number, example: 20 })
  pageSize: number;

  @ApiProperty({ type: Number, example: 42, description: 'Total invoices matching the filters' })
  total: number;

  @ApiProperty({ type: Number, example: 3 })
  totalPages: number;
}

export class PaginatedInvoicesDto {
  @ApiProperty({ type: () => [InvoiceSummaryDto] })
  data: InvoiceSummaryDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}

// Money and quantities are fixed-scale decimal strings: JSON numbers are floats,
// and Prisma's Decimal would otherwise drop trailing zeros ("122.5").
export function toInvoiceSummary(invoice: Invoice): InvoiceSummaryDto {
  return {
    id: invoice.id,
    documentId: invoice.documentId,
    supplierName: invoice.supplierName,
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate.toISOString().slice(0, 10),
    totalAmount: invoice.totalAmount.toFixed(2),
    currency: invoice.currency,
    createdAt: invoice.createdAt.toISOString(),
  };
}

export function toInvoiceDetail(invoice: Invoice & { items: InvoiceItem[] }): InvoiceDetailDto {
  return Object.assign(toInvoiceSummary(invoice), {
    updatedAt: invoice.updatedAt.toISOString(),
    items: invoice.items.map((item) => ({
      description: item.description,
      quantity: item.quantity.toFixed(3),
      unitPrice: item.unitPrice.toFixed(2),
      totalPrice: item.totalPrice.toFixed(2),
    })),
  });
}
