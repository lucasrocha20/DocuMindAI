import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { type Document, DocumentStatus, Prisma } from '../generated/prisma/client.js';
import { InvoiceExtractionError } from '../invoice-extraction/invoice-extraction.errors.js';
import { INVOICE_EXTRACTOR, type InvoiceExtractor } from '../invoice-extraction/invoice-extractor.interface.js';
import { PdfExtractionError } from '../pdf/pdf-extraction.errors.js';
import { PdfExtractionService } from '../pdf/pdf-extraction.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { INVOICE_PROCESSING_QUEUE, type ProcessInvoiceJobData } from '../queues/invoice-processing.queue.js';
import { StorageService } from '../storage/storage.service.js';
import { toSafeErrorMessage } from './safe-error-message.js';
import { withoutSensitiveDetails } from './sanitize-error.js';

@Processor(INVOICE_PROCESSING_QUEUE)
export class InvoiceProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(InvoiceProcessingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly pdfExtraction: PdfExtractionService,
    @Inject(INVOICE_EXTRACTOR) private readonly invoiceExtractor: InvoiceExtractor,
  ) {
    super();
  }

  async process(job: Job<ProcessInvoiceJobData>): Promise<void> {
    const { documentId } = job.data;

    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) {
      // No document to retry against; retrying would never succeed.
      throw new UnrecoverableError(`Document not found: ${documentId}`);
    }

    const existingInvoice = await this.prisma.invoice.findUnique({ where: { documentId } });
    if (existingInvoice) {
      // A previous attempt already saved the Invoice (this run is a retry or
      // duplicate job) - the Invoice's existence is the source of truth for
      // "already processed", so skip re-extraction rather than risk calling
      // OpenAI again and hitting the unique documentId constraint.
      this.logger.log(`Document ${documentId} already has an Invoice, skipping re-extraction`);
      if (document.status !== DocumentStatus.COMPLETED) {
        await this.prisma.document.update({
          where: { id: documentId },
          data: { status: DocumentStatus.COMPLETED, errorMessage: null },
        });
      }
      return;
    }

    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: DocumentStatus.PROCESSING, errorMessage: null },
    });

    try {
      await this.extractAndSaveInvoice(document);

      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: DocumentStatus.COMPLETED },
      });
    } catch (rawError) {
      const error = withoutSensitiveDetails(rawError);
      this.logger.error(
        `Failed to process document ${documentId}`,
        error instanceof Error ? error.stack : String(error),
      );
      const errorMessage = toSafeErrorMessage(error);
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: DocumentStatus.FAILED, errorMessage },
      });
      // Rethrow so BullMQ records the job as failed. Permanent failures are
      // wrapped so BullMQ doesn't retry them (each retry would flip the
      // document back to PROCESSING and only fail the same way again).
      throw isPermanentFailure(error) ? new UnrecoverableError(errorMessage) : error;
    }
  }

  private async extractAndSaveInvoice(document: Document): Promise<void> {
    const pdfBuffer = await this.storage.read(document.storageKey);
    const { text } = await this.pdfExtraction.extractText(pdfBuffer);
    const result = await this.invoiceExtractor.extract(text);
    const { data, metadata } = result;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.invoice.create({
          data: {
            documentId: document.id,
            supplierName: data.supplierName,
            invoiceNumber: data.invoiceNumber,
            issueDate: new Date(data.issueDate),
            totalAmount: data.totalAmount,
            currency: data.currency,
            // Raw validated extraction payload (data + provider metadata), kept
            // for audit/debugging independent of the typed Invoice columns.
            extractionData: { data, metadata } as unknown as Prisma.InputJsonValue,
            items: {
              create: data.items.map((item, index) => ({
                position: index,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.totalPrice,
              })),
            },
          },
        });
      });
    } catch (error) {
      // The unique documentId constraint is what makes duplicates impossible.
      // Hitting it means another worker saved this document's Invoice while we
      // were extracting (a stalled-job redelivery, say): that is success, not a failure.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.log(`Invoice for document ${document.id} was saved by another worker, keeping it`);
        return;
      }
      throw error;
    }
  }
}

// Retrying cannot change these outcomes: the PDF itself is unusable, or the
// API key is rejected. Everything else (timeouts, rate limits, bad AI output,
// database blips) can succeed on a later attempt.
function isPermanentFailure(error: unknown): boolean {
  return (
    error instanceof PdfExtractionError ||
    (error instanceof InvoiceExtractionError && error.reason === 'AUTH_ERROR')
  );
}
