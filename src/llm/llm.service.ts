import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmChatOptions {
  messages: LlmMessage[];
  /** Max tokens to generate. Defaults to 1500. */
  maxTokens?: number;
}

@Injectable()
export class LlmService implements OnModuleInit {
  private readonly logger = new Logger(LlmService.name);
  private client: OpenAI;
  private model: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'OPENAI_API_KEY is not set — AI chat will be unavailable.',
      );
    }
    this.model = this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';
    this.client = new OpenAI({ apiKey: apiKey ?? 'not-configured' });
  }

  /**
   * Send a conversation to the LLM and return the assistant reply text.
   * Throws if the API key is missing or the API call fails.
   */
  async chat(options: LlmChatOptions): Promise<string> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error(
        'AI chat is not configured. Please set OPENAI_API_KEY on the server.',
      );
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: options.messages,
      max_tokens: options.maxTokens ?? 1500,
      temperature: 0.3,
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) {
      throw new Error('The AI returned an empty response. Please try again.');
    }
    return text;
  }
}
