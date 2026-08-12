import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { LlmModule } from 'src/llm/llm.module';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [
    AuthModule, // exports JwtModule so JwtAuthGuard works
    LlmModule,  // exports LlmService for AI chat
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
