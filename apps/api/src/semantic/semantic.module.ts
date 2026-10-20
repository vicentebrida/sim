import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { EmbeddingProvider, OpenAiCompatibleProvider } from './embedding-provider';
import { IntegrationsController } from './integrations.controller';
import { SemanticService } from './semantic.service';

@Global()
@Module({
  controllers: [IntegrationsController],
  providers: [
    SemanticService,
    {
      provide: EmbeddingProvider,
      inject: [ENV],
      // Without SIM_EMBEDDINGS_URL the service never calls it.
      useFactory: (env: Env): EmbeddingProvider =>
        env.SIM_EMBEDDINGS_URL
          ? new OpenAiCompatibleProvider({
              url: env.SIM_EMBEDDINGS_URL,
              model: env.SIM_EMBEDDINGS_MODEL!,
              apiKey: env.SIM_EMBEDDINGS_API_KEY,
            })
          : { embed: () => Promise.reject(new Error('SIM_EMBEDDINGS_URL is not set')) },
    },
  ],
  exports: [SemanticService],
})
export class SemanticModule {}
