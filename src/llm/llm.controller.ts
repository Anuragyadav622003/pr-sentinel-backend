import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { LlmConfigService } from './services/llm-config.service';
import { FreeQuotaService } from './services/free-quota.service';
import { CreateLlmConfigDto } from './dto/create-llm-config.dto';
import { LlmProviderType, LlmMode } from './types/llm.types';
import { UpdateLlmModeDto } from './dto/update-llm-mode.dto';

@Controller('llm')
@UseGuards(JwtAuthGuard)
export class LlmConfigController {
  constructor(
    private readonly llmConfigService: LlmConfigService,
    private readonly freeQuota: FreeQuotaService,
  ) {}

  @Get('config')
  async list(@Req() req) {
    return this.llmConfigService.listConfigs(req.user.id);
  }

  @Post('config')
  async upsert(@Req() req, @Body() dto: CreateLlmConfigDto) {
    return this.llmConfigService.upsertConfig(
      req.user.id,
      dto.provider,
      dto.apiKey,
      dto.model,
    );
  }

  @Delete('config/:provider')
  async remove(@Req() req, @Param('provider') provider: LlmProviderType) {
    return this.llmConfigService.removeConfig(req.user.id, provider);
  }

  @Get('mode')
  async getMode(@Req() req) {
    const { llmMode } = await this.llmConfigService.getMode(req.user.id);
    const remainingFree =
      llmMode === LlmMode.FREE ? await this.freeQuota.getRemaining(req.user.id) : undefined;

    return { llmMode, remainingFree };
  }

  @Patch('mode')
  async updateMode(@Req() req, @Body() dto: UpdateLlmModeDto) {
    return this.llmConfigService.updateMode(req.user.id, dto.llmMode);
  }
}