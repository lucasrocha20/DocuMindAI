import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const schema = z.object({ page: z.coerce.number().int().min(1), name: z.string().min(1) });

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);

  it('returns the parsed (coerced) value when valid', () => {
    expect(pipe.transform({ page: '2', name: 'x' })).toEqual({ page: 2, name: 'x' });
  });

  it('throws a 400 whose message lists every problem as "path: reason"', () => {
    let thrown: unknown;
    try {
      pipe.transform({ page: '0', name: '' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const { message, statusCode } = (thrown as BadRequestException).getResponse() as {
      message: string[];
      statusCode: number;
    };
    expect(statusCode).toBe(400);
    expect(message).toHaveLength(2);
    expect(message.some((line) => line.startsWith('page: '))).toBe(true);
    expect(message.some((line) => line.startsWith('name: '))).toBe(true);
  });

  it('labels a problem with the whole value as (root)', () => {
    let thrown: BadRequestException | undefined;
    try {
      pipe.transform('not an object');
    } catch (error) {
      thrown = error as BadRequestException;
    }

    const { message } = thrown!.getResponse() as { message: string[] };
    expect(message[0]).toMatch(/^\(root\): /);
  });
});
