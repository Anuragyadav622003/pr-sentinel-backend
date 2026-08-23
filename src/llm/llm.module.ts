import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { LlmFactory } from './llm.factory';
import { LlmConfigService } from './services/llm-config.service';
import { FreeQuotaService } from './services/free-quota.service';
import { FreeQuotaGuard } from './guards/free-quota.quard';
import { OpenRouterProvider } from './providers/openrouter/openrouter.provider';
import { ApiKeyEncryptionService } from './encryption/api-key-encryption.service';
import { RedisService } from 'src/shared/redis/redis.service';
import { LlmConfigController } from './llm.controller';

@Module({
  controllers: [LlmConfigController],
  providers: [
    RedisService,
    LlmService,
    LlmConfigService,
    LlmFactory,
    FreeQuotaService,
    FreeQuotaGuard,
    OpenRouterProvider,
    ApiKeyEncryptionService,
  ],
  exports: [
    LlmService,        // used by ReviewsModule's BullMQ worker
    FreeQuotaGuard,    // used by ReviewsModule's controller endpoint
    FreeQuotaService,  // exported in case you want getRemaining() for a UI quota badge
    LlmConfigService,  // exported so other modules can read llmMode if needed
  ],
})
export class LlmModule {}
