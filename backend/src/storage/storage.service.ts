import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';

@Injectable()
export class StorageService {
  private readonly uploadsDir = resolve(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads');

  async save(storageKey: string, buffer: Buffer): Promise<void> {
    const path = this.pathFor(storageKey);
    // Owner-only: invoices shouldn't be readable by other users on the host.
    await mkdir(this.uploadsDir, { recursive: true, mode: 0o700 });
    await writeFile(path, buffer, { mode: 0o600 });
  }

  async read(storageKey: string): Promise<Buffer> {
    return readFile(this.pathFor(storageKey));
  }

  async remove(storageKey: string): Promise<void> {
    await rm(this.pathFor(storageKey), { force: true });
  }

  // Keys are flat, generated filenames. Refusing anything that resolves outside
  // the uploads directory makes path traversal impossible even if a bad key
  // ever reached this layer, and the error deliberately omits the path.
  private pathFor(storageKey: string): string {
    const path = resolve(this.uploadsDir, storageKey);
    if (dirname(path) !== this.uploadsDir) {
      throw new Error('Invalid storage key');
    }
    return path;
  }
}
