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
  CUSTOM_TEXTS,
  type CustomTextKey,
  type CustomTexts,
  TEXT_LANGUAGES,
} from '../database/schema';

export const MAX_BRANDING_IMAGE_BYTES = 2 * 1024 * 1024;
/** Larger logos stay out of e-mails: the logo goes along with every message. */
export const MAX_EMAIL_LOGO_BYTES = 300 * 1024;
/** What e-mail clients show; SVG, WebP and ICO are often blocked or broken. */
const EMAIL_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/gif'];

/** Applies the texts sent over the current ones; an empty text is removed (back to default). */
export function mergeTexts(current: CustomTexts, changes: CustomTexts): CustomTexts {
  const merged: CustomTexts = structuredClone(current);
  for (const [key, languages] of Object.entries(changes) as [
    CustomTextKey,
    Record<string, string>,
  ][]) {
    if (!languages) continue;
    const entry = { ...merged[key] };
    for (const [language, text] of Object.entries(languages)) {
      if (text === undefined) continue;
      if (text) entry[language as (typeof TEXT_LANGUAGES)[number]] = text;
      else delete entry[language as (typeof TEXT_LANGUAGES)[number]];
    }
    if (Object.keys(entry).length) merged[key] = entry;
    else delete merged[key];
  }
  return merged;
}

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
      texts: Object.fromEntries(
        (Object.keys(CUSTOM_TEXTS) as CustomTextKey[]).map((key) => [
          key,
          { 'pt-BR': row.texts[key]?.['pt-BR'] || null, en: row.texts[key]?.en || null },
        ]),
      ) as Record<CustomTextKey, { 'pt-BR': string | null; en: string | null }>,
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
    texts?: CustomTexts;
  }) {
    const current = await this.get();
    const { texts: changes, ...rest } = data;
    const texts = changes ? mergeTexts(current.texts, changes) : undefined;
    await this.db
      .update(branding)
      .set({ ...rest, ...(texts && { texts }), updatedAt: new Date() })
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

  /**
   * The logo to send inline in e-mails: the light one (e-mails have a white background), or the
   * dark one when it is the only one, as on the web. Null when there is none that fits.
   */
  async emailLogo() {
    const row = await this.get();
    const asset = row.logoLight ?? row.logoDark;
    if (!asset || !EMAIL_LOGO_TYPES.includes(asset.contentType)) return null;
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of await this.storage.read(asset.storageKey)) {
      size += (chunk as Buffer).length;
      if (size > MAX_EMAIL_LOGO_BYTES) return null;
      chunks.push(chunk as Buffer);
    }
    const extension = asset.contentType.slice('image/'.length).replace('jpeg', 'jpg');
    return {
      content: Buffer.concat(chunks),
      contentType: asset.contentType,
      filename: `logo.${extension}`,
    };
  }
}

export const isAssetKind = (value: string): value is BrandingAssetKind =>
  (BRANDING_ASSETS as readonly string[]).includes(value);
