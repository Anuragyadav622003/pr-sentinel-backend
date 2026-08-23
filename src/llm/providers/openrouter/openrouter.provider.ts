import { Injectable, InternalServerErrorException } from '@nestjs/common';
import OpenAI from 'openai';
import {
  LlmChatRequest,
  LlmReviewRequest,
  LlmReviewResponse,
  LlmProvider
} from '../../types/llm.types';


@Injectable()
export class OpenRouterProvider implements LlmProvider {
  async review(request: LlmReviewRequest): Promise<LlmReviewResponse> {
    return this.chat({
      apiKey: request.apiKey,
      model: request.model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
    });
  }

  async chat(request: LlmChatRequest): Promise<LlmReviewResponse> {
    const client = new OpenAI({
      apiKey: request.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer':
          process.env.APP_URL ?? 'https://anurag-yadav-portfolio.vercel.app',
        'X-Title': 'PR Sentinel',
      },
    });

    try {
      const completion = await client.chat.completions.create({
        model: request.model,
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      return {
        content: completion.choices[0]?.message?.content ?? '',
        model: completion.model,
        usage: {
          inputTokens: completion.usage?.prompt_tokens,
          outputTokens: completion.usage?.completion_tokens,
        },
      };
    } catch (err) {
      throw new InternalServerErrorException(
        `OpenRouter request failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }
}