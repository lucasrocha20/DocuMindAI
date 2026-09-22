import { Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvoiceExtractionError } from '../invoice-extraction.errors.js';
import { OpenAiInvoiceExtractor } from './openai-invoice-extractor.service.js';

const validInvoicePayload = {
  supplierName: 'Acme Robotics Ltd.',
  invoiceNumber: 'INV-2024-1042',
  issueDate: '2026-09-10',
  totalAmount: 122.5,
  currency: 'BRL',
  items: [
    { description: 'Widget A', quantity: 5, unitPrice: 12.5, totalPrice: 62.5 },
    { description: 'Widget B', quantity: 2, unitPrice: 30, totalPrice: 60 },
  ],
};

function successCompletion(content: string | null) {
  return {
    object: 'chat.completion' as const,
    model: 'gpt-4o-mini',
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 120, completion_tokens: 80 },
  };
}

type FakeClient = { chat: { completions: { create: ReturnType<typeof vi.fn> } } };

// The extractor builds its own SDK client; swap in a fake so nothing goes over the network.
function extractorWith(create: ReturnType<typeof vi.fn>) {
  const extractor = new OpenAiInvoiceExtractor();
  (extractor as unknown as { client: FakeClient }).client = { chat: { completions: { create } } };
  return extractor;
}

async function failureOf(promise: Promise<unknown>): Promise<InvoiceExtractionError> {
  const error = await promise.then(
    () => {
      throw new Error('expected the extraction to fail');
    },
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(InvoiceExtractionError);
  return error as InvoiceExtractionError;
}

describe('OpenAiInvoiceExtractor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('successful extraction', () => {
    it('returns validated data and metadata for a well-formed response', async () => {
      const create = vi.fn().mockResolvedValue(successCompletion(JSON.stringify(validInvoicePayload)));

      const result = await extractorWith(create).extract('some invoice text');

      expect(result.data).toEqual(validInvoicePayload);
      expect(result.metadata).toEqual({
        model: 'gpt-4o-mini',
        extractedAt: expect.any(String),
        promptTokens: 120,
        completionTokens: 80,
      });
    });

    it('normalises what the model returns (trimmed text, upper-case currency)', async () => {
      const messy = { ...validInvoicePayload, supplierName: '  Acme Robotics Ltd.  ', currency: 'brl' };
      const create = vi.fn().mockResolvedValue(successCompletion(JSON.stringify(messy)));

      const { data } = await extractorWith(create).extract('text');

      expect(data.supplierName).toBe('Acme Robotics Ltd.');
      expect(data.currency).toBe('BRL');
    });

    it('asks for strict schema-constrained JSON at temperature 0 with a timeout, sending only the invoice text', async () => {
      const create = vi.fn().mockResolvedValue(successCompletion(JSON.stringify(validInvoicePayload)));

      await extractorWith(create).extract('THE INVOICE TEXT');

      const [params, options] = create.mock.calls[0];
      expect(params.model).toBe('gpt-4o-mini');
      expect(params.temperature).toBe(0);
      expect(params.messages).toEqual([
        { role: 'system', content: expect.any(String) },
        { role: 'user', content: 'THE INVOICE TEXT' },
      ]);
      expect(params.response_format).toMatchObject({
        type: 'json_schema',
        json_schema: { strict: true, schema: expect.objectContaining({ additionalProperties: false }) },
      });
      expect(options).toEqual({ timeout: 30_000 });
    });
  });

  describe('responses that cannot be trusted', () => {
    it('rejects content that is not valid JSON', async () => {
      const error = await failureOf(extractorWith(vi.fn().mockResolvedValue(successCompletion('{not valid json'))).extract('t'));

      expect(error.reason).toBe('INVALID_RESPONSE');
    });

    it('rejects JSON wrapped in a markdown code fence rather than guessing at it', async () => {
      const fenced = `\`\`\`json\n${JSON.stringify(validInvoicePayload)}\n\`\`\``;

      const error = await failureOf(extractorWith(vi.fn().mockResolvedValue(successCompletion(fenced))).extract('t'));

      expect(error.reason).toBe('INVALID_RESPONSE');
    });

    it.each([
      ['an incomplete object', { supplierName: 'Acme' }],
      ['a null value', null],
      ['an array', []],
      ['numbers as strings', { ...validInvoicePayload, totalAmount: '122.50' }],
      ['an impossible date', { ...validInvoicePayload, issueDate: '2026-02-30' }],
      ['a total too large for the database', { ...validInvoicePayload, totalAmount: 1e12 }],
    ])('rejects valid JSON that fails the schema: %s', async (_label, payload) => {
      const create = vi.fn().mockResolvedValue(successCompletion(JSON.stringify(payload)));

      const error = await failureOf(extractorWith(create).extract('t'));

      expect(error.reason).toBe('INVALID_RESPONSE');
    });

    it.each([
      ['null content', successCompletion(null)],
      ['empty content', successCompletion('')],
      ['no choices', { object: 'chat.completion', model: 'm', choices: [] }],
      ['a streaming chunk instead of a completion', { object: 'chat.completion.chunk', choices: [] }],
    ])('rejects a response with %s', async (_label, completion) => {
      const error = await failureOf(extractorWith(vi.fn().mockResolvedValue(completion)).extract('t'));

      expect(error.reason).toBe('INVALID_RESPONSE');
    });
  });

  describe('API failures map to a typed error with a safe message', () => {
    it.each([
      ['a timeout', new OpenAI.APIConnectionTimeoutError(), 'TIMEOUT'],
      ['a rate limit', new OpenAI.RateLimitError(429, {}, 'Rate limit exceeded', new Headers()), 'RATE_LIMITED'],
      ['a rejected API key', new OpenAI.AuthenticationError(401, {}, 'Invalid API key', new Headers()), 'AUTH_ERROR'],
      ['a provider 500', new OpenAI.InternalServerError(500, {}, 'Internal error', new Headers()), 'PROVIDER_ERROR'],
      ['a bad request', new OpenAI.BadRequestError(400, {}, 'Bad request', new Headers()), 'PROVIDER_ERROR'],
      ['a network failure', new OpenAI.APIConnectionError({ message: 'ECONNREFUSED' }), 'PROVIDER_ERROR'],
      ['an unexpected error', new Error('socket hang up'), 'PROVIDER_ERROR'],
    ])('%s', async (_label, thrown, reason) => {
      const error = await failureOf(extractorWith(vi.fn().mockRejectedValue(thrown)).extract('t'));

      expect(error.reason).toBe(reason);
      expect(error.cause).toBe(thrown);
    });

    it('never puts the provider’s raw message (which can echo credentials) in the error it surfaces', async () => {
      const leaky = new OpenAI.AuthenticationError(401, {}, 'Incorrect API key provided: sk-live-1234567890', new Headers());

      const error = await failureOf(extractorWith(vi.fn().mockRejectedValue(leaky)).extract('t'));

      expect(error.message).not.toContain('sk-live');
    });
  });

  describe('logging', () => {
    it('never logs the invoice text, the model output, or the API key, on success or failure', async () => {
      const logged: string[] = [];
      for (const level of ['log', 'warn', 'error'] as const) {
        vi.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
          logged.push(args.map(String).join(' '));
        });
      }
      const sensitiveText = 'SENSITIVE-INVOICE-TEXT Acme account 12345-6';
      const sensitiveOutput = '{"supplierName":"SENSITIVE-MODEL-OUTPUT"';

      await extractorWith(vi.fn().mockResolvedValue(successCompletion(JSON.stringify(validInvoicePayload)))).extract(sensitiveText);
      await failureOf(extractorWith(vi.fn().mockResolvedValue(successCompletion(sensitiveOutput))).extract(sensitiveText));
      await failureOf(extractorWith(vi.fn().mockRejectedValue(new OpenAI.AuthenticationError(401, {}, 'bad key test-key', new Headers()))).extract(sensitiveText));

      expect(logged.length).toBeGreaterThan(0);
      const everything = logged.join('\n');
      expect(everything).not.toContain('SENSITIVE');
      expect(everything).not.toContain('Acme Robotics');
      expect(everything).not.toContain('test-key');
    });
  });

  describe('no real network in tests', () => {
    it('is configured with a dummy key and a dead local endpoint', () => {
      const client = (new OpenAiInvoiceExtractor() as unknown as { client: { baseURL: string; apiKey: string } }).client;

      expect(client.baseURL).toBe('http://127.0.0.1:9');
      expect(client.apiKey).toBe('test-key');
    });

    it('fails fast, without touching the internet, if a test forgets to fake the client', async () => {
      const error = await failureOf(new OpenAiInvoiceExtractor().extract('t'));

      expect(error.reason).toBe('PROVIDER_ERROR');
    }, 15_000);
  });
});
