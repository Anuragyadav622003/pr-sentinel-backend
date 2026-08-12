import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AuthenticatedUser } from 'src/auth/auth.types';
import { PullRequestService } from './pull-request.service';

type AuthedRequest = Request & { user: AuthenticatedUser };

@Controller('pull-requests')
@UseGuards(JwtAuthGuard)
export class PullRequestController {
  constructor(private readonly pullRequestService: PullRequestService) {}

  // ─── GET /api/pull-requests ───────────────────────────────────────────────
  //
  // Returns all pull requests the user can see, with optional filters.
  // Query params: repositoryId, status, author, since (ISO date string).

  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Query('repositoryId') repositoryId?: string,
    @Query('status') status?: string,
    @Query('author') author?: string,
    @Query('since') since?: string,
  ) {
    const sinceDate = since ? new Date(since) : undefined;

    const prs = await this.pullRequestService.findAllForUser(req.user.id, {
      repositoryId,
      status,
      author,
      since: sinceDate,
    });

    return prs.map((pr) => ({
      id: pr.id,
      githubPrId: Number(pr.githubPrId),
      githubPrNumber: pr.githubPrNumber,
      title: pr.title,
      author: pr.author,
      baseBranch: pr.baseBranch,
      headBranch: pr.headBranch,
      status: pr.status,
      errorMessage: pr.errorMessage ?? null,
      lastDeliveryId: pr.lastDeliveryId ?? null,
      repositoryId: pr.repositoryId,
      repository: pr.repository
        ? {
            id: pr.repository.id,
            owner: pr.repository.owner,
            name: pr.repository.name,
            fullName: pr.repository.fullName,
          }
        : null,
      createdAt: pr.createdAt.toISOString(),
      updatedAt: pr.updatedAt.toISOString(),
    }));
  }

  // ─── GET /api/pull-requests/:id ───────────────────────────────────────────
  //
  // Full PR detail including changed files and the latest review + comments.
  // Ownership is enforced by scoping the query to the authenticated user's
  // installation — a different user's PR id returns 404.

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: AuthedRequest) {
    const pr = await this.pullRequestService.findByIdForUser(id, req.user.id);
    if (!pr) {
      throw new NotFoundException('Pull request not found');
    }

    // The latest review (if any) — reviews are ordered desc by createdAt.
    const latestReview = pr.reviews[0] ?? null;

    return {
      id: pr.id,
      githubPrId: Number(pr.githubPrId),
      githubPrNumber: pr.githubPrNumber,
      title: pr.title,
      author: pr.author,
      baseBranch: pr.baseBranch,
      headBranch: pr.headBranch,
      status: pr.status,
      errorMessage: pr.errorMessage ?? null,
      lastDeliveryId: pr.lastDeliveryId ?? null,
      repositoryId: pr.repositoryId,
      repository: pr.repository
        ? {
            id: pr.repository.id,
            owner: pr.repository.owner,
            name: pr.repository.name,
            fullName: pr.repository.fullName,
          }
        : null,
      files: pr.files.map((f) => ({
        id: f.id,
        filename: f.filename,
        status: f.status.toLowerCase(),
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        pullRequestId: f.pullRequestId,
        createdAt: f.createdAt.toISOString(),
      })),
      review: latestReview
        ? {
            id: latestReview.id,
            provider: latestReview.provider,
            summary: latestReview.summary ?? null,
            status: latestReview.status,
            errorMessage: latestReview.errorMessage ?? null,
            pullRequestId: latestReview.pullRequestId,
            comments: latestReview.comments.map((c) => ({
              id: c.id,
              filePath: c.filePath,
              lineNumber: c.lineNumber ?? null,
              severity: c.severity ?? null,
              category: c.category ?? null,
              message: c.message,
              postedToGithub: c.postedToGithub,
              githubCommentId: c.githubCommentId
                ? String(c.githubCommentId)
                : null,
              reviewId: c.reviewId,
              createdAt: c.createdAt.toISOString(),
            })),
            createdAt: latestReview.createdAt.toISOString(),
            updatedAt: latestReview.updatedAt.toISOString(),
          }
        : null,
      createdAt: pr.createdAt.toISOString(),
      updatedAt: pr.updatedAt.toISOString(),
    };
  }
}
