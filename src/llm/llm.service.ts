import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { LlmFactory } from './llm.factory';
import { LlmConfigService } from './services/llm-config.service';
import { FreeQuotaService } from './services/free-quota.service';
import { LlmProviderType,LlmReviewResponse,LlmMessage, LlmMode } from './types/llm.types';

@Injectable()
export class LlmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: LlmFactory,
    private readonly llmConfig: LlmConfigService,
    private readonly freeQuota: FreeQuotaService,
  ) {}

  /** Single-turn: used by the review-generation worker. */
  async generateReview(
    userId: string,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<LlmReviewResponse> {
    const { apiKey, model } = await this.resolveKeyAndModel(userId);
    const provider = this.factory.getProvider(LlmProviderType.OPENROUTER);
    return provider.review({ apiKey, model, systemPrompt, userPrompt });
  }

  /** Multi-turn: used by ReviewsService.chat() for "ask about this review". */
  async chat(userId: string, messages: LlmMessage[]): Promise<string> {
    const { apiKey, model } = await this.resolveKeyAndModel(userId);
    const provider = this.factory.getProvider(LlmProviderType.OPENROUTER);
    const result = await provider.chat({ apiKey, model, messages });
    return result.content;
  }

  private async resolveKeyAndModel(
    userId: string,
  ): Promise<{ apiKey: string; model: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (user.llmMode === LlmMode.BYOK) {
      return this.llmConfig.getDecryptedConfig(userId, LlmProviderType.OPENROUTER);
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_DEFAULT_MODEL;
    if (!apiKey || !model) {
      throw new InternalServerErrorException(
        'OPENROUTER_API_KEY / OPENROUTER_DEFAULT_MODEL not configured',
      );
    }

    await this.freeQuota.consumeFreeReview(userId);
    return { apiKey, model };
  }
}