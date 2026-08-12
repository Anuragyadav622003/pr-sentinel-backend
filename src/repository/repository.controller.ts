import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AuthenticatedUser } from 'src/auth/auth.types';
import { RepositoryService } from './repository.service';
import { PullRequestService } from 'src/pull-request/pull-request.service';

type AuthedRequest = Request & { user: AuthenticatedUser };

@Controller('repositories')
@UseGuards(JwtAuthGuard)
export class RepositoryController {
  constructor(
    private readonly repositoryService: RepositoryService,
    private readonly pullRequestService: PullRequestService,
  ) {}

  // ─── GET /api/repositories ────────────────────────────────────────────────
  //
  // Returns all active repositories for the authenticated user, with PR counts.

  @Get()
  async list(@Req() req: AuthedRequest) {
    const repos =
      await this.repositoryService.findActiveReposWithCountsByUserId(
        req.user.id,
      );

    return repos.map((r) => ({
      id: r.id,
      githubRepoId: Number(r.githubRepoId),
      owner: r.owner,
      name: r.name,
      fullName: r.fullName,
      isActive: r.isActive,
      installationId: r.installationId,
      htmlUrl: r.htmlUrl ?? null,
      pullRequestCount: r._count.pullRequests,
      // reviewCount will be added once Review table is written by the AI pipeline
      reviewCount: 0,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  // ─── GET /api/repositories/:id ────────────────────────────────────────────

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: AuthedRequest) {
    const repo = await this.repositoryService.findByIdForUser(id, req.user.id);
    if (!repo) {
      throw new NotFoundException('Repository not found');
    }

    return {
      id: repo.id,
      githubRepoId: Number(repo.githubRepoId),
      owner: repo.owner,
      name: repo.name,
      fullName: repo.fullName,
      isActive: repo.isActive,
      installationId: repo.installationId,
      htmlUrl: repo.htmlUrl ?? null,
      pullRequestCount: repo._count.pullRequests,
      reviewCount: 0,
      createdAt: repo.createdAt.toISOString(),
      updatedAt: repo.updatedAt.toISOString(),
    };
  }

  // ─── GET /api/repositories/:id/pull-requests ─────────────────────────────
  //
  // Pull requests scoped to a specific repository. The repository ownership
  // check is implicit — findByIdForUser returns null if it belongs to
  // another user, giving a 404 rather than leaking data.

  @Get(':id/pull-requests')
  async pullRequests(@Param('id') id: string, @Req() req: AuthedRequest) {
    const repo = await this.repositoryService.findByIdForUser(id, req.user.id);
    if (!repo) {
      throw new NotFoundException('Repository not found');
    }

    const prs = await this.pullRequestService.findByRepository(repo.id);

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
      repository: {
        id: repo.id,
        owner: repo.owner,
        name: repo.name,
        fullName: repo.fullName,
      },
      createdAt: pr.createdAt.toISOString(),
      updatedAt: pr.updatedAt.toISOString(),
    }));
  }
}
