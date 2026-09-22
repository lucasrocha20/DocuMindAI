import { Prisma } from '../generated/prisma/client.js';

/**
 * A Prisma validation error's message quotes the whole failed invocation,
 * including the data it was given (here: invoice contents). Swap it for a
 * generic error before it is logged or handed to BullMQ, which persists
 * failure messages and stack traces in Redis.
 */
export function withoutSensitiveDetails(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientValidationError) {
    return new Error('PrismaClientValidationError: request rejected by Prisma (details omitted, they contain request data)');
  }
  return error;
}
