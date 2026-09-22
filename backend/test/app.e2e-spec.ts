import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { InvoiceProcessingProcessor } from '../src/processing/invoice-processing.processor.js';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Only the pipeline e2e spec runs a worker; here it would compete for jobs.
      .overrideProvider(InvoiceProcessingProcessor)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / responds', async () => {
    await request(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
  });

  it('GET /health reports ok with a timestamp', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body.status).toBe('ok');
    expect(new Date(response.body.timestamp).toString()).not.toBe('Invalid Date');
  });
});
