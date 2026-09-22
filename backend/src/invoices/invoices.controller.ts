import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { InvoiceDetailDto, PaginatedInvoicesDto } from './dto/invoice-response.dto.js';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type ListInvoicesQuery,
  listInvoicesQuerySchema,
} from './dto/list-invoices-query.js';
import { InvoicesService } from './invoices.service.js';

@ApiTags('invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @ApiOperation({ summary: 'List extracted invoices, newest first' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    example: DEFAULT_PAGE_SIZE,
    description: `Items per page (max ${MAX_PAGE_SIZE})`,
  })
  @ApiQuery({ name: 'supplierName', required: false, type: String, description: 'Case-insensitive partial match' })
  @ApiQuery({ name: 'invoiceNumber', required: false, type: String, description: 'Case-insensitive partial match' })
  @ApiOkResponse({ type: PaginatedInvoicesDto })
  @ApiBadRequestResponse({ description: 'Invalid pagination or filter parameters' })
  findAll(
    @Query(new ZodValidationPipe(listInvoicesQuerySchema)) query: ListInvoicesQuery,
  ): Promise<PaginatedInvoicesDto> {
    return this.invoicesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an invoice with its line items' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: InvoiceDetailDto })
  @ApiBadRequestResponse({ description: 'The id is not a valid UUID' })
  @ApiNotFoundResponse({ description: 'No invoice with this id' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<InvoiceDetailDto> {
    return this.invoicesService.findOne(id);
  }
}
