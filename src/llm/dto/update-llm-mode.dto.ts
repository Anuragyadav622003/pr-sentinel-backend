import { IsEnum } from 'class-validator';
import { LlmMode } from 'src/generated/prisma/enums';


export class UpdateLlmModeDto {
  @IsEnum(LlmMode)
  llmMode!: LlmMode;
}