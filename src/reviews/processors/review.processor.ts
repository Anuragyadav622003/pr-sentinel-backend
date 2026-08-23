import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ReviewGenerationService } from '../services/review-generation.service';
import { ReviewPublisherService } from '../services/review-publisher.service';

export interface GenerateReviewJobData {
  pullRequestId: string;
  userId: string;
}

@Processor('review') // ADJUST: match your existing queue name
export class ReviewProcessor extends WorkerHost {
  private readonly logger = new Logger(ReviewProcessor.name);

  constructor(
    private readonly reviewGeneration: ReviewGenerationService,
    private readonly reviewPublisher: ReviewPublisherService,
  ) {
    super();
  }

  async process(job: Job<GenerateReviewJobData>): Promise<void> {
    const { pullRequestId, userId } = job.data;
    this.logger.log(`Processing review job for PR ${pullRequestId}`);

    const reviewId = await this.reviewGeneration.runReview(pullRequestId, userId);

    try {
      await this.reviewPublisher.publish(reviewId);
    } catch (err) {
      this.logger.error(
        `Review ${reviewId} generated but failed to publish to GitHub: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
      // Not re-thrown — review itself succeeded; only publishing failed.
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<GenerateReviewJobData>, err: Error) {
    this.logger.error(`Review job ${job.id} failed permanently: ${err.message}`);
  }
}