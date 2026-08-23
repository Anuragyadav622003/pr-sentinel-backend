export enum LlmProviderType {
  OPENROUTER = 'OPENROUTER',
  OPENAI = 'OPENAI',
  GEMINI = 'GEMINI',
  ANTHROPIC = 'ANTHROPIC',
}

export enum LlmMode {
  FREE = 'FREE',
  BYOK = 'BYOK',
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmChatRequest {
  apiKey: string;
  model: string;
  messages: LlmMessage[];
}

export interface LlmReviewRequest {
  apiKey: string;
  model: string;

  systemPrompt: string;
  userPrompt: string;

}

export interface LlmReviewResponse {
  content: string;
  model?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface LlmProvider {
  review(request: LlmReviewRequest): Promise<LlmReviewResponse>;
  chat(request: LlmChatRequest): Promise<LlmReviewResponse>;
}