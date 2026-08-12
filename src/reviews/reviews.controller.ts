import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AuthenticatedUser } from 'src/auth/auth.types';
import { ReviewsService } from './reviews.service';
import { ChatReviewDto } from './dto/chat-review.dto';

type AuthedRequest = Request & { user: AuthenticatedUser };

@Controller('reviews')
@UseGuards(JwtAuthGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // ─── GET /api/reviews ─────────────────────────────────────────────────────
  //
  // Returns all reviews for the authenticated user's repositories,
  // ordered by most-recently created. Each review includes a lightweight
  // comments projection (id + severity) so the list view can show counts.

  @Get()
  async list(@Req() req: AuthedRequest) {
    const reviews = await this.reviewsService.findAllForUser(req.user.id);

    return reviews.map((r) => ({
      id: r.id,
      provider: r.provider,
      summary: r.summary ?? null,
      status: r.status,
      errorMessage: r.errorMessage ?? null,
      pullRequestId: r.pullRequestId,
      comments: (r.comments ?? []).map((c) => ({
        id: c.id,
        severity: c.severity ?? null,
      })),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  // ─── GET /api/reviews/pull-request/:pullRequestId ─────────────────────────
  //
  // IMPORTANT: this route MUST be registered before ":id" to prevent NestJS
  // from treating "pull-request" as a dynamic segment value.

  @Get('pull-request/:pullRequestId')
  async getByPullRequest(
    @Param('pullRequestId') pullRequestId: string,
    @Req() req: AuthedRequest,
  ) {
    const review = await this.reviewsService.findByPullRequestForUser(
      pullRequestId,
      req.user.id,
    );
    if (!review) return null;

    return {
      id: review.id,
      provider: review.provider,
      summary: review.summary ?? null,
      status: review.status,
      errorMessage: review.errorMessage ?? null,
      pullRequestId: review.pullRequestId,
      comments: (review.comments ?? []).map((c) => ({
        id: c.id,
        filePath: c.filePath,
        lineNumber: c.lineNumber ?? null,
        severity: c.severity ?? null,
        category: c.category ?? null,
        message: c.message,
        suggestion: null,
        postedToGithub: c.postedToGithub,
        githubCommentId: c.githubCommentId ? String(c.githubCommentId) : null,
        reviewId: c.reviewId,
        createdAt: c.createdAt.toISOString(),
      })),
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
    };
  }

  // ─── GET /api/reviews/:id ─────────────────────────────────────────────────

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: AuthedRequest) {
    const review = await this.reviewsService.findByIdForUser(id, req.user.id);
    if (!review) throw new NotFoundException('Review not found');

    return {
      id: review.id,
      provider: review.provider,
      summary: review.summary ?? null,
      status: review.status,
      errorMessage: review.errorMessage ?? null,
      pullRequestId: review.pullRequestId,
      comments: (review.comments ?? []).map((c) => ({
        id: c.id,
        filePath: c.filePath,
        lineNumber: c.lineNumber ?? null,
        severity: c.severity ?? null,
        category: c.category ?? null,
        message: c.message,
        suggestion: null,
        postedToGithub: c.postedToGithub,
        githubCommentId: c.githubCommentId ? String(c.githubCommentId) : null,
        reviewId: c.reviewId,
        createdAt: c.createdAt.toISOString(),
      })),
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
    };
  }

  // ─── POST /api/reviews/:id/retry ──────────────────────────────────────────

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  async retry(@Param('id') id: string, @Req() req: AuthedRequest) {
    const review = await this.reviewsService.retryReview(id, req.user.id);

    return {
      id: review.id,
      provider: review.provider,
      summary: review.summary ?? null,
      status: review.status,
      errorMessage: review.errorMessage ?? null,
      pullRequestId: review.pullRequestId,
      comments: [],
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
    };
  }

  // ─── POST /api/reviews/:id/chat ───────────────────────────────────────────
  //
  // Send a user message about a specific review and receive an AI reply.
  //
  // Request body:  { message: string, conversationId?: string }
  // Response body: { message: string, conversationId: string }
  //
  // The conversationId is created on the first turn and must be echoed back by
  // the client on subsequent turns to maintain conversation history.

  @Post(':id/chat')
  @HttpCode(HttpStatus.OK)
  async chat(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
    @Body() body: ChatReviewDto,
  ) {
    const result = await this.reviewsService.chat(
      id,
      req.user.id,
      body.message,
      body.conversationId,
    );

    return result; // { message: string, conversationId: string }
  }
}
