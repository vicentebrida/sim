import { Controller, Get, Inject, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { AdministratorOnly } from '../auth/decorators';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
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
  }),
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
    };
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
