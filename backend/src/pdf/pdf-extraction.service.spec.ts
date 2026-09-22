import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { MAX_EXTRACTED_TEXT_LENGTH, MAX_PDF_PAGES } from './pdf-extraction.constants.js';
import { PdfExtractionError } from './pdf-extraction.errors.js';
import { PdfExtractionService } from './pdf-extraction.service.js';

const fixturesDir = join(import.meta.dirname, '..', '..', 'test', 'fixtures', 'pdf');

async function loadFixture(name: string): Promise<Buffer> {
  return readFile(join(fixturesDir, name));
}

describe('PdfExtractionService', () => {
  const service = new PdfExtractionService();
  let textInvoice: Buffer;
  let insufficientText: Buffer;
  let corrupt: Buffer;
  let oversizedText: Buffer;

  beforeAll(async () => {
    [textInvoice, insufficientText, corrupt, oversizedText] = await Promise.all([
      loadFixture('text-invoice.pdf'),
      loadFixture('insufficient-text.pdf'),
      loadFixture('corrupt.pdf'),
      loadFixture('oversized-text.pdf'),
    ]);
  });

  it('extracts text from a text-based PDF invoice', async () => {
    const result = await service.extractText(textInvoice);

    expect(result.pageCount).toBe(1);
    expect(result.truncated).toBe(false);
    expect(result.text).toContain('Supplier: Acme Robotics Ltd.');
    expect(result.text).toContain('Invoice Number: INV-2024-1042');
  });

  it('throws INSUFFICIENT_TEXT for a PDF with no usable text layer (e.g. scanned)', async () => {
    const error = await service.extractText(insufficientText).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PdfExtractionError);
    expect((error as PdfExtractionError).reason).toBe('INSUFFICIENT_TEXT');
  });

  it('throws INVALID_PDF for a file that is not a real PDF', async () => {
    const error = await service.extractText(corrupt).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PdfExtractionError);
    expect((error as PdfExtractionError).reason).toBe('INVALID_PDF');
  });

  it('truncates text beyond the maximum length and reports truncation', async () => {
    const result = await service.extractText(oversizedText);

    expect(result.text.length).toBe(MAX_EXTRACTED_TEXT_LENGTH);
    expect(result.truncated).toBe(true);
  });

  describe('page limit', () => {
    it('accepts a PDF at the limit', async () => {
      const result = await service.extractText(buildPdfWithPages(MAX_PDF_PAGES));

      expect(result.pageCount).toBe(MAX_PDF_PAGES);
    });

    it('rejects a PDF over the limit before extracting any text', async () => {
      const error = await service.extractText(buildPdfWithPages(MAX_PDF_PAGES + 1)).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(PdfExtractionError);
      expect((error as PdfExtractionError).reason).toBe('TOO_MANY_PAGES');
      expect((error as PdfExtractionError).message).toContain(String(MAX_PDF_PAGES));
    });
  });
});

// A small valid PDF whose pages all show the same line of text.
function buildPdfWithPages(pageCount: number): Buffer {
  const fontObject = pageCount + 3;
  const contentObject = pageCount + 4;
  const stream = 'BT /F1 12 Tf 72 700 Td (Invoice page text used for the page limit tests) Tj ET';

  const objects: string[] = [];
  objects[1] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const kids = Array.from({ length: pageCount }, (_, index) => `${index + 3} 0 R`).join(' ');
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\nendobj\n`;
  for (let index = 0; index < pageCount; index++) {
    objects[index + 3] =
      `${index + 3} 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 ${fontObject} 0 R >> >> ` +
      `/MediaBox [0 0 612 792] /Contents ${contentObject} 0 R >>\nendobj\n`;
  }
  objects[fontObject] = `${fontObject} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;
  objects[contentObject] =
    `${contentObject} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`;

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id <= contentObject; id++) {
    offsets[id] = body.length;
    body += objects[id];
  }
  let xref = `xref\n0 ${contentObject + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= contentObject; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  const trailer = `trailer\n<< /Size ${contentObject + 1} /Root 1 0 R >>\nstartxref\n${body.length}\n%%EOF`;
  return Buffer.from(body + xref + trailer, 'latin1');
}
