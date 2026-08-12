import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ChatReviewDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message: string;

  /**
   * Optional conversation ID to continue an existing thread.
   * If omitted the service starts a fresh conversation.
   */
  @IsOptional()
  @IsString()
  conversationId?: string;
}
