import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { getQueueToken } from '@nestjs/bullmq';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { InvoiceProcessingProcessor } from '../src/processing/invoice-processing.processor.js';
import { INVOICE_PROCESSING_QUEUE } from '../src/queues/invoice-processing.queue.js';

const uploadsDir = resolve(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads');

describe('Security (e2e)', () => {
  const apps: NestExpressApplication[] = [];
  const documentIds: string[] = [];
  let validPdf: Buffer;

  beforeAll(async () => {
    validPdf = await readFile(join(import.meta.dirname, 'fixtures', 'pdf', 'text-invoice.pdf'));
  });

  // Builds the app exactly as main.ts does (same configureApp), reading whatever
  // environment the test has stubbed so far. No worker: nothing processes uploads.
  async function createApp(): Promise<NestExpressApplication> {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(InvoiceProcessingProcessor)
      .useValue({})
      .compile();
    const app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    apps.push(app);
    return app;
  }

  afterEach(async () => {
    vi.unstubAllEnvs();
    const [app] = apps;
    if (app && documentIds.length > 0) {
      const prisma = app.get(PrismaService);
      const queue: Queue = app.get(getQueueToken(INVOICE_PROCESSING_QUEUE));
      const documents = await prisma.document.findMany({
        where: { id: { in: documentIds } },
        select: { storageKey: true },
      });
      await prisma.document.deleteMany({ where: { id: { in: documentIds } } });
      await Promise.all([
        ...documents.map((doc) => rm(join(uploadsDir, doc.storageKey), { force: true })),
        ...documentIds.map(async (id) => (await queue.getJob(id))?.remove()),
      ]);
      documentIds.length = 0;
    }
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function upload(app: NestExpressApplication, filename = 'invoice.pdf') {
    const response = await request(app.getHttpServer()).post('/documents/upload').attach('file', validPdf, filename);
    if (response.status === 201) documentIds.push(response.body.id);
    return response;
  }

  describe('response headers', () => {
    it('does not advertise the framework, and stops content sniffing', async () => {
      const app = await createApp();

      const response = await request(app.getHttpServer()).get('/health').expect(200);

      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('answers unknown routes with a bare JSON error: no stack, no file paths', async () => {
      const app = await createApp();

      const response = await request(app.getHttpServer()).get('/no/such/route').expect(404);

      expect(Object.keys(response.body).sort()).toEqual(['error', 'message', 'statusCode']);
      expect(JSON.stringify(response.body)).not.toMatch(/\s+at\s|node_modules|\/home\//);
    });
  });

  describe('CORS', () => {
    it('only ever grants the configured origin, never a wildcard or the caller\'s own', async () => {
      vi.stubEnv('CORS_ORIGIN', 'https://app.example.com');
      const app = await createApp();
      const server = app.getHttpServer();

      const allowed = await request(server).get('/health').set('Origin', 'https://app.example.com');
      const other = await request(server).get('/health').set('Origin', 'https://evil.example');
      const none = await request(server).get('/health');

      // A fixed origin is always answered with that one origin; the browser refuses to
      // honour it for any other page. What must never happen is echoing a foreign
      // origin back, or answering with a wildcard.
      expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example.com');
      for (const response of [other, none]) {
        expect(response.headers['access-control-allow-origin']).toBe('https://app.example.com');
        expect(response.headers['access-control-allow-origin']).not.toBe('https://evil.example');
      }
    });

    it('never grants a preflight to another origin, and never enables credentials', async () => {
      vi.stubEnv('CORS_ORIGIN', 'https://app.example.com');
      const app = await createApp();
      const server = app.getHttpServer();

      const evil = await request(server)
        .options('/documents/upload')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'POST');
      const good = await request(server)
        .options('/documents/upload')
        .set('Origin', 'https://app.example.com')
        .set('Access-Control-Request-Method', 'POST');

      expect(evil.headers['access-control-allow-origin']).not.toBe('https://evil.example');
      expect(evil.headers['access-control-allow-origin']).not.toBe('*');
      expect(good.headers['access-control-allow-origin']).toBe('https://app.example.com');
      expect(good.headers['access-control-allow-credentials']).toBeUndefined();
    });
  });

  describe('API docs exposure', () => {
    it('are served in development', async () => {
      const app = await createApp();

      await request(app.getHttpServer()).get('/docs').expect(200);
      await request(app.getHttpServer()).get('/docs-json').expect(200);
    });

    it('are not served in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const app = await createApp();

      await request(app.getHttpServer()).get('/docs').expect(404);
      await request(app.getHttpServer()).get('/docs-json').expect(404);
    });

    it('can be switched on explicitly, even in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('ENABLE_SWAGGER', 'true');
      const app = await createApp();

      await request(app.getHttpServer()).get('/docs-json').expect(200);
    });
  });

  describe('upload request shape', () => {
    it('rejects an extra form field alongside the file', async () => {
      const app = await createApp();
      const filename = `extra-field-${randomUUID()}.pdf`;

      const response = await request(app.getHttpServer())
        .post('/documents/upload')
        .field('note', 'x')
        .attach('file', validPdf, filename)
        .expect(400);

      expect(response.body.statusCode).toBe(400);
      expect(await app.get(PrismaService).document.count({ where: { filename } })).toBe(0);
    });

    it('rejects a second file in the same request', async () => {
      const app = await createApp();
      const filename = `two-files-${randomUUID()}.pdf`;

      await request(app.getHttpServer())
        .post('/documents/upload')
        .attach('file', validPdf, filename)
        .attach('file', validPdf, 'second.pdf')
        .expect(400);

      expect(await app.get(PrismaService).document.count({ where: { filename } })).toBe(0);
    });
  });

  describe('rate limiting', () => {
    it('limits uploads per client, tighter than other routes, with Retry-After', async () => {
      vi.stubEnv('UPLOAD_RATE_LIMIT', '2');
      const app = await createApp();

      await upload(app).then((response) => expect(response.status).toBe(201));
      await upload(app).then((response) => expect(response.status).toBe(201));
      const limited = await upload(app);

      expect(limited.status).toBe(429);
      expect(limited.body.statusCode).toBe(429);
      expect(limited.headers['retry-after']).toBeDefined();
      // Reading is a separate, looser budget.
      await request(app.getHttpServer()).get('/documents').expect(200);
    });

    it('limits ordinary routes too', async () => {
      vi.stubEnv('THROTTLE_LIMIT', '5');
      const app = await createApp();

      for (let count = 0; count < 5; count++) {
        await request(app.getHttpServer()).get('/documents').expect(200);
      }

      await request(app.getHttpServer()).get('/documents').expect(429);
    });

    it('never limits the health probe', async () => {
      vi.stubEnv('THROTTLE_LIMIT', '2');
      const app = await createApp();

      for (let count = 0; count < 20; count++) {
        await request(app.getHttpServer()).get('/health').expect(200);
      }
    });

    it('is not reset by a client that makes up its own X-Forwarded-For', async () => {
      vi.stubEnv('THROTTLE_LIMIT', '2');
      const app = await createApp();
      const get = (forwardedFor: string) =>
        request(app.getHttpServer()).get('/documents').set('X-Forwarded-For', forwardedFor);

      await get('10.0.0.1').expect(200);
      await get('10.0.0.2').expect(200);

      await get('10.0.0.3').expect(429);
    });

    it('tells clients apart by X-Forwarded-For only when told a proxy sits in front', async () => {
      vi.stubEnv('THROTTLE_LIMIT', '2');
      vi.stubEnv('TRUST_PROXY', '1');
      const app = await createApp();
      const get = (forwardedFor: string) =>
        request(app.getHttpServer()).get('/documents').set('X-Forwarded-For', forwardedFor);

      await get('10.0.0.1').expect(200);
      await get('10.0.0.1').expect(200);
      await get('10.0.0.1').expect(429);

      await get('10.0.0.2').expect(200);
    });
  });
});
