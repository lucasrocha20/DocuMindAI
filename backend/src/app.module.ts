import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Redis } from 'ioredis';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { throttleLimit, throttleTtlMs } from './common/rate-limit.config.js';
import { validateEnv } from './config/env.validation.js';
import { DocumentsModule } from './documents/documents.module.js';
import { HealthModule } from './health/health.module.js';
import { InvoiceExtractionModule } from './invoice-extraction/invoice-extraction.module.js';
import { InvoicesModule } from './invoices/invoices.module.js';
import { PdfExtractionModule } from './pdf/pdf-extraction.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProcessingModule } from './processing/processing.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: throttleTtlMs, limit: throttleLimit }] }),
    BullModule.forRoot({
      connection: new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
        maxRetriesPerRequest: null,
      }),
    }),
    PrismaModule,
    DocumentsModule,
    ProcessingModule,
    PdfExtractionModule,
    InvoiceExtractionModule,
    InvoicesModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
