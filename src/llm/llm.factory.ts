import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';

import { OpenRouterProvider } from './providers/openrouter/openrouter.provider';

import {
  LlmProviderType,
  LlmProvider
} from './types/llm.types';



@Injectable()
export class LlmFactory {
  constructor(
    private readonly openRouterProvider: OpenRouterProvider,
  ) {}

  getProvider(
    provider: LlmProviderType,
  ): LlmProvider {
    switch (provider) {
      case LlmProviderType.OPENROUTER:
        return this.openRouterProvider;

      case LlmProviderType.OPENAI:
        throw new BadRequestException(
          'OpenAI provider is not implemented yet',
        );

      case LlmProviderType.GEMINI:
        throw new BadRequestException(
          'Gemini provider is not implemented yet',
        );

      case LlmProviderType.ANTHROPIC:
        throw new BadRequestException(
          'Anthropic provider is not implemented yet',
        );

      default:
        throw new BadRequestException(
          'Unsupported LLM provider',
        );
    }
  }
}