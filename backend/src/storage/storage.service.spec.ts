import { randomUUID } from 'node:crypto';
import { access, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { StorageService } from './storage.service.js';

const uploadsDir = resolve(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads');

describe('StorageService', () => {
  const service = new StorageService();
  const created: string[] = [];

  afterEach(async () => {
    await Promise.all(created.map((key) => rm(join(uploadsDir, key), { force: true })));
    created.length = 0;
  });

  it('round-trips a file by its storage key', async () => {
    const key = `${randomUUID()}.pdf`;
    created.push(key);

    await service.save(key, Buffer.from('%PDF-1.4 hello'));

    expect((await service.read(key)).toString()).toBe('%PDF-1.4 hello');
  });

  it.skipIf(process.platform === 'win32')('stores files readable by the owner only', async () => {
    const key = `${randomUUID()}.pdf`;
    created.push(key);

    await service.save(key, Buffer.from('%PDF-1.4'));

    expect((await stat(join(uploadsDir, key))).mode & 0o777).toBe(0o600);
  });

  it('removes a file, and removing a missing file is not an error', async () => {
    const key = `${randomUUID()}.pdf`;
    await service.save(key, Buffer.from('x'));

    await service.remove(key);
    await expect(access(join(uploadsDir, key))).rejects.toThrow();
    await expect(service.remove(key)).resolves.toBeUndefined();
  });

  describe('rejects keys that could point outside the uploads directory', () => {
    const outside = `escaped-${randomUUID()}.pdf`;

    afterEach(async () => {
      await rm(resolve(uploadsDir, '..', outside), { force: true });
    });

    it.each([
      ['a parent-directory traversal', `../${outside}`],
      ['a nested path', `nested/${outside}`],
      ['an absolute path', '/etc/passwd'],
      ['an empty key', ''],
    ])('%s', async (_label, key) => {
      await expect(service.save(key, Buffer.from('x'))).rejects.toThrow('Invalid storage key');
      await expect(service.read(key)).rejects.toThrow('Invalid storage key');
      await expect(service.remove(key)).rejects.toThrow('Invalid storage key');
      await expect(access(resolve(uploadsDir, '..', outside))).rejects.toThrow();
    });

    it('without revealing the resolved path in the error', async () => {
      const error = await service.read('../secret').catch((caught: unknown) => caught);

      expect((error as Error).message).toBe('Invalid storage key');
    });
  });
});
