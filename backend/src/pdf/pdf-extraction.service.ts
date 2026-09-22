import { Injectable, Logger } from '@nestjs/common';
import { extractText, getDocumentProxy } from 'unpdf';
import {
  MAX_EXTRACTED_TEXT_LENGTH,
  MAX_PDF_PAGES,
  MIN_EXTRACTED_TEXT_LENGTH,
} from './pdf-extraction.constants.js';
import { PdfExtractionError } from './pdf-extraction.errors.js';

export interface PdfExtractionResult {
  text: string;
  pageCount: number;
  truncated: boolean;
}

@Injectable()
export class PdfExtractionService {
  private readonly logger = new Logger(PdfExtractionService.name);

  /**
   * Extracts text from a text-based PDF. Throws PdfExtractionError for
   * malformed files or documents with no usable text layer (scanned/image
   * PDFs - OCR is not implemented yet).
   */
  async extractText(pdfBuffer: Buffer): Promise<PdfExtractionResult> {
    const document = await this.loadDocument(pdfBuffer);
    if (document.numPages > MAX_PDF_PAGES) {
      throw new PdfExtractionError(
        `This PDF has ${document.numPages} pages. Documents over ${MAX_PDF_PAGES} pages aren't supported.`,
        'TOO_MANY_PAGES',
      );
    }
    const { totalPages, text } = await extractText(document, { mergePages: true });
    const trimmedText = text.trim();

    if (trimmedText.length < MIN_EXTRACTED_TEXT_LENGTH) {
      throw new PdfExtractionError(
        'No extractable text was found in this PDF. It may be a scanned or image-based document, which is not supported yet.',
        'INSUFFICIENT_TEXT',
      );
    }

    const truncated = trimmedText.length > MAX_EXTRACTED_TEXT_LENGTH;

    return {
      text: truncated ? trimmedText.slice(0, MAX_EXTRACTED_TEXT_LENGTH) : trimmedText,
      pageCount: totalPages,
      truncated,
    };
  }

  private async loadDocument(pdfBuffer: Buffer) {
    try {
      return await getDocumentProxy(new Uint8Array(pdfBuffer), { verbosity: 0 });
    } catch (error) {
      this.logger.warn(`Failed to parse PDF: ${error instanceof Error ? error.message : String(error)}`);
      throw new PdfExtractionError('The file could not be read as a valid PDF document.', 'INVALID_PDF');
    }
  }
}
