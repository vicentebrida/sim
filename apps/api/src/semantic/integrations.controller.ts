import { Controller, Get, Inject, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { AntivirusService } from '../antivirus/antivirus.service';
import { AdministratorOnly } from '../auth/decorators';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { WEBHOOK_CHANNELS } from '../database/schema';
import { WebhooksService } from '../webhooks/webhooks.service';
import { SemanticService } from './semantic.service';

class IntegrationsDto extends createZodDto(
  z.object({
    sso: z.object({ mode: z.enum(['off', 'oidc', 'oauth2']) }),
    smtp: z.object({ configured: z.boolean() }),
    // Where Attachments and identity images are kept.
    storage: z.object({ kind: z.enum(['disk', 's3']) }),
    redis: z.object({ configured: z.boolean() }),
    semanticSearch: z.object({
      configured: z.boolean(),
      model: z.string().nullable(),
      threshold: z.number(),
      // Published Ideas, how many have a vector, and how many wait for the background job.
      total: z.number().int(),
      indexed: z.number().int(),
      pending: z.number().int(),
    }),
    // Chat channels that get the news (the URLs are secrets and never leave the server).
    webhooks: z.object({
      channels: z.array(z.enum(WEBHOOK_CHANNELS)),
      events: z.array(z.enum(['published', 'status'])),
    }),
    // ClamAV checking every Attachment before it is stored.
    antivirus: z.object({ configured: z.boolean() }),
  }),
) {}

class WebhookTestDto extends createZodDto(
  z.array(
    z.object({ channel: z.enum(WEBHOOK_CHANNELS), ok: z.boolean(), error: z.string().nullable() }),
  ),
) {}

class AntivirusTestDto extends createZodDto(
  z.object({ ok: z.boolean(), version: z.string().nullable(), error: z.string().nullable() }),
) {}

class ConnectionTestDto extends createZodDto(
  z.object({
    ok: z.boolean(),
    dimensions: z.number().int().nullable(),
    error: z.string().nullable(),
  }),
) {}

/**
 * Integrations come from environment variables (ADR-0007); this only shows their state, never
 * the secrets, and lets the Administrator test the connection.
 */
@ApiTags('integrations')
@Controller('integrations')
@AdministratorOnly()
export class IntegrationsController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly semantic: SemanticService,
    private readonly webhooks: WebhooksService,
    private readonly antivirus: AntivirusService,
  ) {}

  @Get()
  @ZodResponse({ status: 200, type: IntegrationsDto })
  async get() {
    const coverage = this.semantic.enabled
      ? await this.semantic.coverage()
      : { total: 0, indexed: 0, pending: 0 };
    return {
      sso: { mode: this.env.SIM_SSO_MODE },
      smtp: { configured: Boolean(this.env.SMTP_URL) },
      storage: { kind: this.env.SIM_STORAGE },
      redis: { configured: Boolean(this.env.REDIS_URL) },
      semanticSearch: {
        configured: this.semantic.enabled,
        model: this.env.SIM_EMBEDDINGS_MODEL ?? null,
        threshold: this.env.SIM_SEMANTIC_THRESHOLD,
        ...coverage,
      },
      webhooks: {
        channels: this.webhooks.channels.map(({ channel }) => channel),
        events: this.webhooks.events,
      },
      antivirus: { configured: this.antivirus.enabled },
    };
  }

  /** Sends a test message to each configured channel. */
  @Post('webhooks/test')
  @ZodResponse({ status: 200, type: WebhookTestDto })
  testWebhooks() {
    return this.webhooks.test();
  }

  /** Asks clamd for its version (and the date of its virus database). */
  @Post('antivirus/test')
  @ZodResponse({ status: 200, type: AntivirusTestDto })
  async testAntivirus() {
    const result = await this.antivirus.test();
    return result.ok
      ? { ok: true, version: result.version, error: null }
      : { ok: false, version: null, error: result.error };
  }

  @Post('semantic-search/test')
  @ZodResponse({ status: 200, type: ConnectionTestDto })
  async testSemanticSearch() {
    if (!this.semantic.enabled) {
      return { ok: false, dimensions: null, error: 'SIM_EMBEDDINGS_URL is not set' };
    }
    const result = await this.semantic.test();
    return result.ok
      ? { ok: true, dimensions: result.dimensions, error: null }
      : { ok: false, dimensions: null, error: result.error };
  }
}
