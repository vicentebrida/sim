import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/** Where the bytes of Attachments and of the identity images live: disk, or S3-compatible storage. */
export abstract class FileStorage {
  abstract save(key: string, data: Buffer): Promise<void>;
  abstract read(key: string): Promise<Readable>;
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

  async read(key: string) {
    return createReadStream(this.path(key));
  }

  async remove(key: string) {
    await rm(this.path(key), { force: true });
  }
}

export interface S3Options {
  bucket: string;
  region: string;
  /** For services other than AWS (MinIO, Cloudflare R2, Backblaze...). */
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** `bucket.host` (default) or `host/bucket` (needed by MinIO and some others). */
  forcePathStyle?: boolean;
}

/** S3-compatible object storage. Objects live under `attachments/`, like the disk folder. */
export class S3Storage extends FileStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: S3Options) {
    super();
    this.bucket = options.bucket;
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
      // Without keys the SDK uses its usual chain (IAM role, environment...).
      ...(options.accessKeyId && options.secretAccessKey
        ? {
            credentials: {
              accessKeyId: options.accessKeyId,
              secretAccessKey: options.secretAccessKey,
            },
          }
        : {}),
      // Checksums on every request are not understood by every S3-compatible service.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  private objectKey(key: string) {
    if (!SAFE_KEY.test(key)) throw new Error('Invalid storage key');
    return `attachments/${key}`;
  }

  async save(key: string, data: Buffer) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key), Body: data }),
    );
  }

  async read(key: string) {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }),
    );
    return response.Body as Readable;
  }

  async remove(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }),
    );
  }
}
