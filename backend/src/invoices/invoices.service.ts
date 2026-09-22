import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ListInvoicesQuery } from './dto/list-invoices-query.js';
import {
  type InvoiceDetailDto,
  type PaginatedInvoicesDto,
  toInvoiceDetail,
  toInvoiceSummary,
} from './dto/invoice-response.dto.js';

// Prisma's `contains` passes the value into a LIKE pattern unescaped, so a
// search for "50%" or "_" would act as a wildcard instead of literal text.
function containsLiteral(value: string): { contains: string; mode: 'insensitive' } {
  return { contains: value.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' };
}

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListInvoicesQuery): Promise<PaginatedInvoicesDto> {
    const { page, pageSize, supplierName, invoiceNumber } = query;

    const where: Prisma.InvoiceWhereInput = {
      ...(supplierName && { supplierName: containsLiteral(supplierName) }),
      ...(invoiceNumber && { invoiceNumber: containsLiteral(invoiceNumber) }),
    };

    const [total, invoices] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        // id breaks createdAt ties so pages never overlap or skip rows.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: invoices.map(toInvoiceSummary),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async findOne(id: string): Promise<InvoiceDetailDto> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return toInvoiceDetail(invoice);
  }
}
