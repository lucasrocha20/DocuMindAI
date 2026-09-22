import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { INVOICE_PROCESSING_QUEUE } from '../queues/invoice-processing.queue.js';
import { StorageModule } from '../storage/storage.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

@Module({
  imports: [BullModule.registerQueue({ name: INVOICE_PROCESSING_QUEUE }), StorageModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
