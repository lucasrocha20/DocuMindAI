import { Module } from '@nestjs/common';
import { OpenAiInvoiceExtractor } from './openai/openai-invoice-extractor.service.js';
import { INVOICE_EXTRACTOR } from './invoice-extractor.interface.js';

@Module({
  providers: [{ provide: INVOICE_EXTRACTOR, useClass: OpenAiInvoiceExtractor }],
  exports: [INVOICE_EXTRACTOR],
})
export class InvoiceExtractionModule {}
