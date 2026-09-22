import { randomUUID } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { DocumentStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  INVOICE_PROCESSING_QUEUE,
  PROCESS_INVOICE_JOB,
  type ProcessInvoiceJobData,
} from '../queues/invoice-processing.queue.js';
import { StorageService } from '../storage/storage.service.js';
import { ENQUEUE_TIMEOUT_MS } from './documents.constants.js';
import { type DocumentResponseDto, toDocumentResponse } from './dto/document-response.dto.js';
import { sanitizeFilename } from './sanitize-filename.js';

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(INVOICE_PROCESSING_QUEUE) private readonly queue: Queue<ProcessInvoiceJobData>,
  ) {}

  async upload(file: Express.Multer.File): Promise<DocumentResponseDto> {
    const storageKey = `${randomUUID()}.pdf`;
    const filename = sanitizeFilename(file.originalname);

    await this.storage.save(storageKey, file.buffer);

    let document;
    try {
      document = await this.prisma.document.create({
        data: { filename, storageKey },
      });
    } catch (error) {
      // Nothing references the file now, so don't leave it behind.
      await this.storage.remove(storageKey).catch(() => {
        this.logger.warn(`Could not remove orphaned upload ${storageKey}`);
      });
      throw error;
    }

    try {
      await withTimeout(
        this.queue.add(
          PROCESS_INVOICE_JOB,
          { documentId: document.id },
          {
            // Deduplicates by document: re-enqueuing the same document while a job
            // for it is still waiting/active is a no-op instead of a second job.
            jobId: document.id,
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: true,
            removeOnFail: { count: 500 },
          },
        ),
        ENQUEUE_TIMEOUT_MS,
        'Timed out waiting for the queue',
      );
    } catch (error) {
      this.logger.error(
        `Failed to queue document ${document.id} for processing`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.prisma.document.update({
        where: { id: document.id },
        data: {
          status: DocumentStatus.FAILED,
          errorMessage: 'Failed to queue document for processing',
        },
      });
      throw new InternalServerErrorException('Failed to queue document for processing');
    }

    return toDocumentResponse(document);
  }

  async findAll(): Promise<DocumentResponseDto[]> {
    const documents = await this.prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { invoice: { select: { id: true } } },
    });
    return documents.map(toDocumentResponse);
  }

  async findOne(id: string): Promise<DocumentResponseDto> {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: { invoice: { select: { id: true } } },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    return toDocumentResponse(document);
  }
}
