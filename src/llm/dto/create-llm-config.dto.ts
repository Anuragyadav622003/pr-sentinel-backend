import { IsEnum, IsString, MinLength } from 'class-validator';
import { LlmProviderType } from '../types/llm.types';


export class CreateLlmConfigDto {
  @IsEnum(LlmProviderType)
  provider!: LlmProviderType;

  @IsString()
  @MinLength(10)
  apiKey!: string;

  @IsString()
  model!: string;
}