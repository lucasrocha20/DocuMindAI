import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { MulterExceptionFilter } from '../common/multer-exception.filter.js';
import { throttleTtlMs, uploadRateLimit } from '../common/rate-limit.config.js';
import { ALLOWED_MIME_TYPE, MAX_UPLOAD_SIZE_BYTES } from './documents.constants.js';
import { DocumentsService } from './documents.service.js';
import type { DocumentResponseDto } from './dto/document-response.dto.js';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseFilters(MulterExceptionFilter)
  // Each accepted upload triggers a paid LLM call, so this is far tighter than the global limit.
  @Throttle({ default: { limit: uploadRateLimit, ttl: throttleTtlMs } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      // Exactly one file part and nothing else: no extra files or text fields to parse or buffer.
      limits: { fileSize: MAX_UPLOAD_SIZE_BYTES, files: 1, fields: 0, parts: 1 },
    }),
  )
  upload(
    @UploadedFile(
      new ParseFilePipeBuilder()
        // Nest's default type message reads "current file type is application/pdf, expected
        // application/pdf" when the *content* isn't a PDF, which is misleading.
        .addFileTypeValidator({ fileType: ALLOWED_MIME_TYPE, errorMessage: 'The uploaded file is not a valid PDF.' })
        .addMaxSizeValidator({ maxSize: MAX_UPLOAD_SIZE_BYTES, errorMessage: 'The file is larger than 10 MB.' })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    file: Express.Multer.File,
  ): Promise<DocumentResponseDto> {
    return this.documentsService.upload(file);
  }

  @Get()
  findAll(): Promise<DocumentResponseDto[]> {
    return this.documentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<DocumentResponseDto> {
    return this.documentsService.findOne(id);
  }
}
