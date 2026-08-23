import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ApiKeyEncryptionService } from '../encryption/api-key-encryption.service';
import { LlmMode } from 'src/generated/prisma/enums';
import { LlmProviderType } from '../types/llm.types';


@Injectable()
export class LlmConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: ApiKeyEncryptionService,
  ) {}

  async upsertConfig(
    userId: string,
    provider: LlmProviderType,
    apiKey: string,
    model: string,
  ) {
    const encryptedApiKey = this.encryption.encrypt(apiKey);

    return this.prisma.userLlmConfig.upsert({
      where: { userId_provider: { userId, provider } },
      create: { userId, provider, encryptedApiKey, model },
      update: { encryptedApiKey, model },
      select: { id: true, provider: true, model: true, isActive: true },
    });
  }

  async getDecryptedConfig(
    userId: string,
    provider: LlmProviderType,
  ): Promise<{ apiKey: string; model: string }> {
    const config = await this.prisma.userLlmConfig.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (!config) throw new NotFoundException('LLM config not found');

    return {
      apiKey: this.encryption.decrypt(config.encryptedApiKey),
      model: config.model,
    };
  }

  async listConfigs(userId: string) {
    return this.prisma.userLlmConfig.findMany({
      where: { userId },
      select: { id: true, provider: true, model: true, isActive: true },
    });
  }

  async removeConfig(userId: string, provider: LlmProviderType) {
    return this.prisma.userLlmConfig.delete({
      where: { userId_provider: { userId, provider } },
    });
  }

  async getMode(userId: string): Promise<{ llmMode: LlmMode }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { llmMode: true },
    });
    return { llmMode: user.llmMode as LlmMode };
  }

  async updateMode(userId: string, llmMode: LlmMode) {
    if (llmMode === LlmMode.BYOK) {
      const hasAnyConfig = await this.prisma.userLlmConfig.findFirst({
        where: { userId },
      });
      if (!hasAnyConfig) {
        throw new BadRequestException(
          'Add at least one provider before switching to BYOK mode',
        );
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { llmMode },
      select: { id: true, llmMode: true },
    });
  }
}