import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { extractedInvoiceSchema } from '../extracted-invoice.schema.js';
import { InvoiceExtractionError } from '../invoice-extraction.errors.js';
import type { InvoiceExtractionResult, InvoiceExtractor } from '../invoice-extractor.interface.js';
import {
  INVOICE_EXTRACTION_SYSTEM_PROMPT,
  INVOICE_JSON_SCHEMA,
  OPENAI_MAX_RETRIES,
  OPENAI_MODEL,
  OPENAI_REQUEST_TIMEOUT_MS,
} from './openai-invoice-extractor.constants.js';

@Injectable()
export class OpenAiInvoiceExtractor implements InvoiceExtractor {
  private readonly logger = new Logger(OpenAiInvoiceExtractor.name);

  private readonly client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: OPENAI_MAX_RETRIES,
  });

  async extract(pdfText: string): Promise<InvoiceExtractionResult> {
    const requestedAt = new Date();

    const rawCompletion = await this.requestCompletion(pdfText);
    const completion = this.assertSuccessResponse(rawCompletion);

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) {
      this.logger.warn('OpenAI response contained no message content');
      throw new InvoiceExtractionError('The extraction provider returned an empty response.', 'INVALID_RESPONSE');
    }

    const parsedJson = this.parseJson(rawContent);
    const validated = this.validate(parsedJson);

    this.logger.log(
      `Extracted invoice via OpenAI (model=${completion.model}, promptTokens=${completion.usage?.prompt_tokens ?? 'unknown'}, completionTokens=${completion.usage?.completion_tokens ?? 'unknown'})`,
    );

    return {
      data: validated,
      metadata: {
        model: completion.model ?? OPENAI_MODEL,
        extractedAt: requestedAt.toISOString(),
        promptTokens: completion.usage?.prompt_tokens ?? null,
        completionTokens: completion.usage?.completion_tokens ?? null,
      },
    };
  }

  private async requestCompletion(pdfText: string) {
    try {
      return await this.client.chat.completions.create(
        {
          model: OPENAI_MODEL,
          temperature: 0,
          messages: [
            { role: 'system', content: INVOICE_EXTRACTION_SYSTEM_PROMPT },
            { role: 'user', content: pdfText },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'invoice_extraction',
              strict: true,
              schema: INVOICE_JSON_SCHEMA,
            },
          },
        },
        { timeout: OPENAI_REQUEST_TIMEOUT_MS },
      );
    } catch (error) {
      throw this.toExtractionError(error);
    }
  }

  private assertSuccessResponse(completion: OpenAI.ChatCompletion) {
    if (completion.object !== 'chat.completion') {
      this.logger.warn(`Unexpected OpenAI response type: ${String(completion.object)}`);
      throw new InvoiceExtractionError('The extraction provider returned an unexpected response.', 'INVALID_RESPONSE');
    }
    return completion;
  }

  private parseJson(rawContent: string): unknown {
    try {
      return JSON.parse(rawContent);
    } catch (error) {
      this.logger.warn(`OpenAI response was not valid JSON (length=${rawContent.length})`);
      throw new InvoiceExtractionError('The extraction provider returned malformed JSON.', 'INVALID_RESPONSE', {
        cause: error,
      });
    }
  }

  private validate(parsedJson: unknown) {
    const result = extractedInvoiceSchema.safeParse(parsedJson);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
      this.logger.warn(`OpenAI response failed schema validation: ${issues.join('; ')}`);
      throw new InvoiceExtractionError(
        'The extracted invoice data did not match the expected schema.',
        'INVALID_RESPONSE',
        { cause: result.error },
      );
    }
    return result.data;
  }

  private toExtractionError(error: unknown): InvoiceExtractionError {
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      this.logger.warn('OpenAI request timed out');
      return new InvoiceExtractionError('The extraction provider timed out.', 'TIMEOUT', { cause: error });
    }
    if (error instanceof OpenAI.RateLimitError) {
      this.logger.warn('OpenAI rate limit exceeded');
      return new InvoiceExtractionError('The extraction provider is rate limited. Try again later.', 'RATE_LIMITED', {
        cause: error,
      });
    }
    if (error instanceof OpenAI.AuthenticationError) {
      this.logger.error('OpenAI authentication failed - check the OPENAI_API_KEY configuration');
      return new InvoiceExtractionError('The extraction provider rejected the request credentials.', 'AUTH_ERROR', {
        cause: error,
      });
    }
    if (error instanceof OpenAI.APIError) {
      this.logger.warn(`OpenAI API error (status=${error.status})`);
      return new InvoiceExtractionError('The extraction provider returned an error.', 'PROVIDER_ERROR', {
        cause: error,
      });
    }
    this.logger.error(`Unexpected error calling OpenAI: ${error instanceof Error ? error.message : String(error)}`);
    return new InvoiceExtractionError('The extraction provider request failed.', 'PROVIDER_ERROR', { cause: error });
  }
}
