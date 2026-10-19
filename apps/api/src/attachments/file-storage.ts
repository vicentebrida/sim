import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';

/** Where the bytes of Attachments live. Disk now; S3-compatible storage can implement the same. */
export abstract class FileStorage {
  abstract save(key: string, data: Buffer): Promise<void>;
  abstract read(key: string): Readable;
  abstract remove(key: string): Promise<void>;
}

const SAFE_KEY = /^[0-9a-f-]{36}$/;

export class DiskStorage extends FileStorage {
  private readonly directory: string;

  constructor(dataDir: string) {
    super();
    this.directory = join(dataDir, 'attachments');
  }

  private path(key: string) {
    // Keys are generated here (UUIDs); this also stops any path from reaching the disk.
    if (!SAFE_KEY.test(key)) throw new Error('Invalid storage key');
    return join(this.directory, key);
  }

  async save(key: string, data: Buffer) {
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.path(key), data, { flag: 'wx' });
  }

  read(key: string) {
    return createReadStream(this.path(key));
  }

  async remove(key: string) {
    await rm(this.path(key), { force: true });
  }
}
