import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { detectBrandingImage } from '../attachments/domain/file-type';
import { FileStorage } from '../attachments/file-storage';
import { DomainError } from '../common/domain-error';
import { DB, type Database } from '../database/database.module';
import {
  type Branding,
  branding,
  type BrandingAssetKind,
  BRANDING_ASSETS,
} from '../database/schema';

export const MAX_BRANDING_IMAGE_BYTES = 2 * 1024 * 1024;

@Injectable()
export class BrandingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly storage: FileStorage,
  ) {}

  async get(): Promise<Branding> {
    await this.db.insert(branding).values({ id: 1 }).onConflictDoNothing();
    const [row] = await this.db.select().from(branding).where(eq(branding.id, 1));
    return row!;
  }

  async present() {
    return this.presentRow(await this.get());
  }

  presentRow(row: Branding) {
    const version = row.updatedAt.getTime();
    const url = (kind: BrandingAssetKind) =>
      row[kind] ? `/api/branding/assets/${kind}?v=${version}` : null;
    return {
      name: row.name,
      primaryColor: row.primaryColor,
      loginTitle: row.loginTitle,
      loginText: row.loginText,
      logoLight: url('logoLight'),
      logoDark: url('logoDark'),
      favicon: url('favicon'),
      loginImage: url('loginImage'),
    };
  }

  async update(data: {
    name?: string;
    primaryColor?: string | null;
    loginTitle?: string;
    loginText?: string;
  }) {
    await this.get();
    await this.db
      .update(branding)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(branding.id, 1));
    return this.present();
  }

  async setAsset(kind: BrandingAssetKind, file: { buffer: Buffer } | undefined) {
    if (!file) throw new DomainError('FILE_REQUIRED', 'Send the file in the "file" field');
    if (file.buffer.length > MAX_BRANDING_IMAGE_BYTES) {
      throw new DomainError('ATTACHMENT_TOO_LARGE', 'The image is larger than 2 MB');
    }
    const contentType = detectBrandingImage(file.buffer);
    if (!contentType)
      throw new DomainError('IMAGE_NOT_ALLOWED', 'Send a PNG, JPG, GIF, WebP, SVG or ICO image');

    const current = await this.get();
    const storageKey = randomUUID();
    await this.storage.save(storageKey, file.buffer);
    await this.db
      .update(branding)
      .set({ [kind]: { storageKey, contentType }, updatedAt: new Date() })
      .where(eq(branding.id, 1));
    if (current[kind]) await this.storage.remove(current[kind].storageKey);
    return this.present();
  }

  async removeAsset(kind: BrandingAssetKind) {
    const current = await this.get();
    await this.db
      .update(branding)
      .set({ [kind]: null, updatedAt: new Date() })
      .where(eq(branding.id, 1));
    if (current[kind]) await this.storage.remove(current[kind].storageKey);
    return this.present();
  }

  async readAsset(kind: BrandingAssetKind) {
    const asset = (await this.get())[kind];
    if (!asset) throw new NotFoundException('Image not set');
    return { contentType: asset.contentType, stream: await this.storage.read(asset.storageKey) };
  }
}

export const isAssetKind = (value: string): value is BrandingAssetKind =>
  (BRANDING_ASSETS as readonly string[]).includes(value);
