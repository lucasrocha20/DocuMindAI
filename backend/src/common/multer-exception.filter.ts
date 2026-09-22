import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  PayloadTooLargeException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { MulterError } from 'multer';

/**
 * Nest maps multer errors to HTTP errors by matching message text, which
 * multer 2 changed (e.g. "Unexpected file field") and extended with new
 * errors, so those fell through as 500s. Client mistakes with an upload are
 * 4xx; this maps on the stable `code` instead.
 */
@Catch(MulterError)
export class MulterExceptionFilter extends BaseExceptionFilter {
  override catch(error: MulterError, host: ArgumentsHost): void {
    const exception =
      error.code === 'LIMIT_FILE_SIZE'
        ? new PayloadTooLargeException(error.message)
        : new BadRequestException(error.message);
    super.catch(exception, host);
  }
}
