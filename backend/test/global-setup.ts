import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// One throwaway uploads directory per test run, removed when the run ends.
// Test files read it via setup-env.ts.
export default function setup() {
  const uploadDir = mkdtempSync(join(tmpdir(), 'documind-test-uploads-'));
  process.env.TEST_UPLOAD_DIR = uploadDir;

  return () => rmSync(uploadDir, { recursive: true, force: true });
}
