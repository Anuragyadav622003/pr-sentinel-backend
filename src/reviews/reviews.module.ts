import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from 'src/auth/auth.module';
import { LlmModule } from 'src/llm/llm.module';
import { GithubModule } from 'src/github/github.module';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { ReviewGenerationService } from './services/review-generation.service';
import { ReviewPublisherService } from './services/review-publisher.service';
import { ReviewProcessor } from './processors/review.processor';
import { RedisService } from 'src/shared/redis/redis.service';

@Module({
  imports: [
    AuthModule,
    LlmModule,
    GithubModule,
    BullModule.registerQueue({ name: 'review' }),
  ],
  controllers: [ReviewsController],
  providers: [
    RedisService,
    ReviewsService,
    ReviewGenerationService,
    ReviewPublisherService,
    ReviewProcessor,
  ],
  exports: [ReviewsService, ReviewGenerationService],
})
export class ReviewsModule {}