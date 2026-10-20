import { Inject, Injectable, Logger } from '@nestjs/common';
import { DomainError } from '../common/domain-error';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { ClamdClient, type ScanResult } from './clamav';

/**
 * Optional antivirus for Attachments (ClamAV through clamd). Turned on by SIM_CLAMAV_URL; while
 * it is on, a file that cannot be checked is refused, never stored unchecked.
 */
@Injectable()
export class AntivirusService {
  private readonly logger = new Logger(AntivirusService.name);
  private readonly client: ClamdClient | null;

  constructor(@Inject(ENV) env: Env) {
    this.client = env.SIM_CLAMAV_URL ? ClamdClient.fromUrl(env.SIM_CLAMAV_URL) : null;
  }

  get enabled() {
    return this.client !== null;
  }

  /** Null when the antivirus is off. */
  async scan(content: Buffer): Promise<ScanResult | null> {
    if (!this.client) return null;
    try {
      return await this.client.scan(content);
    } catch (error) {
      this.logger.warn(`Antivirus unavailable: ${(error as Error).message}`);
      throw new DomainError('ANTIVIRUS_UNAVAILABLE', 'The file could not be checked for viruses');
    }
  }

  async test(): Promise<{ ok: true; version: string } | { ok: false; error: string }> {
    if (!this.client) return { ok: false, error: 'SIM_CLAMAV_URL is not set' };
    try {
      return { ok: true, version: await this.client.version() };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }
}
