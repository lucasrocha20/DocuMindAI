import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { InvoiceExtractionModule } from '../invoice-extraction/invoice-extraction.module.js';
import { PdfExtractionModule } from '../pdf/pdf-extraction.module.js';
import { INVOICE_PROCESSING_QUEUE } from '../queues/invoice-processing.queue.js';
import { StorageModule } from '../storage/storage.module.js';
import { InvoiceProcessingProcessor } from './invoice-processing.processor.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: INVOICE_PROCESSING_QUEUE }),
    StorageModule,
    PdfExtractionModule,
    InvoiceExtractionModule,
  ],
  providers: [InvoiceProcessingProcessor],
})
export class ProcessingModule {}
