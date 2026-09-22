import { basename } from 'node:path';

const MAX_FILENAME_LENGTH = 255;
const FALLBACK_FILENAME = 'document.pdf';
const UNSAFE_CHARACTERS = /[^a-zA-Z0-9._-]/g;

/**
 * Original filenames are client-controlled and must never be used to build
 * filesystem paths. This produces a display-only name: path components and
 * unsafe characters stripped, length capped.
 */
export function sanitizeFilename(originalName: string | undefined): string {
  if (!originalName) {
    return FALLBACK_FILENAME;
  }

  const safe = basename(originalName).replace(UNSAFE_CHARACTERS, '_').slice(0, MAX_FILENAME_LENGTH);

  return safe.length > 0 ? safe : FALLBACK_FILENAME;
}
