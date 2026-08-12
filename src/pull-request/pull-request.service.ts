import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PullRequestStatus, FileStatus } from 'src/generated/prisma/client';
import {
  GithubPullRequest,
  GithubPrFile,
  PullRequestTriggerAction,
} from 'src/webhook/types/github-webhook.types';

@Injectable()
export class PullRequestService {
  private readonly logger = new Logger(PullRequestService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Map the GitHub file status string to our Prisma FileStatus enum.
   * GitHub can also return 'copied', 'changed', 'unchanged' — we treat
   * those as MODIFIED since they are not distinct in our domain.
   */
  private mapFileStatus(githubStatus: GithubPrFile['status']): FileStatus {
    const map: Record<string, FileStatus> = {
      added: FileStatus.ADDED,
      modified: FileStatus.MODIFIED,
      removed: FileStatus.REMOVED,
      renamed: FileStatus.RENAMED,
      copied: FileStatus.MODIFIED,
      changed: FileStatus.MODIFIED,
      unchanged: FileStatus.MODIFIED,
    };
    return map[githubStatus] ?? FileStatus.MODIFIED;
  }

  // ─── PullRequest ───────────────────────────────────────────────────────────

  /**
   * Upsert a PullRequest row.
   * For `opened` we always create-or-update.
   * For `synchronize` / `reopened` we only update an existing record.
   *
   * Returns the persisted record, or null if the delivery is a duplicate.
   */
  async upsertPullRequest(
    repositoryId: string,
    pr: GithubPullRequest,
    action: PullRequestTriggerAction,
    deliveryId: string,
  ) {
    const githubPrId = BigInt(pr.id);

    // Deduplicate: if we already processed this exact delivery, skip.
    const existing = await this.prisma.pullRequest.findUnique({
      where: { githubPrId },
    });

    if (existing?.lastDeliveryId === deliveryId) {
      this.logger.log(
        `Duplicate delivery ${deliveryId} for PR #${pr.number} — skipping`,
      );
      return null;
    }

    const data = {
      githubPrNumber: pr.number,
      title: pr.title,
      author: pr.user.login,
      baseBranch: pr.base.ref,
      headBranch: pr.head.ref,
      status: PullRequestStatus.RECEIVED,
      lastDeliveryId: deliveryId,
      repositoryId,
    };

    let pullRequest;

    if (action === 'opened' || !existing) {
      pullRequest = await this.prisma.pullRequest.upsert({
        where: { githubPrId },
        create: { githubPrId, ...data },
        update: { ...data, updatedAt: new Date() },
      });
      this.logger.log(
        `PullRequest upserted: #${pr.number} "${pr.title}" (id=${pullRequest.id})`,
      );
    } else {
      // synchronize / reopened — update the existing record
      pullRequest = await this.prisma.pullRequest.update({
        where: { githubPrId },
        data: {
          title: pr.title,
          headBranch: pr.head.ref,
          baseBranch: pr.base.ref,
          status: PullRequestStatus.RECEIVED,
          lastDeliveryId: deliveryId,
          updatedAt: new Date(),
        },
      });
      this.logger.log(
        `PullRequest updated (${action}): #${pr.number} (id=${pullRequest.id})`,
      );
    }

    return pullRequest;
  }

  // ─── PrFiles ───────────────────────────────────────────────────────────────

  /**
   * Replace all PrFile records for a pull request.
   * We delete the previous set and insert the latest snapshot so the table
   * always reflects what GitHub reports for the current head commit.
   */
  async replacePrFiles(
    pullRequestId: string,
    files: GithubPrFile[],
  ) {
    // Delete stale files from a previous push
    await this.prisma.prFile.deleteMany({ where: { pullRequestId } });

    const created = await this.prisma.prFile.createMany({
      data: files.map((f) => ({
        pullRequestId,
        filename: f.filename,
        status: this.mapFileStatus(f.status),
        patch: f.patch ?? null,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
      })),
    });

    this.logger.log(
      `PrFiles saved: ${created.count} file(s) for pullRequest ${pullRequestId}`,
    );
    return created;
  }

  // ─── Status helpers ────────────────────────────────────────────────────────

  async markProcessing(pullRequestId: string) {
    return this.prisma.pullRequest.update({
      where: { id: pullRequestId },
      data: { status: PullRequestStatus.PROCESSING, updatedAt: new Date() },
    });
  }

  async markReviewed(pullRequestId: string) {
    return this.prisma.pullRequest.update({
      where: { id: pullRequestId },
      data: { status: PullRequestStatus.REVIEWED, updatedAt: new Date() },
    });
  }

  async markFailed(pullRequestId: string, errorMessage: string) {
    return this.prisma.pullRequest.update({
      where: { id: pullRequestId },
      data: {
        status: PullRequestStatus.FAILED,
        errorMessage,
        updatedAt: new Date(),
      },
    });
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  async findByGithubPrId(githubPrId: number | bigint) {
    return this.prisma.pullRequest.findUnique({
      where: { githubPrId: BigInt(githubPrId) },
      include: { files: true, reviews: true },
    });
  }

  async findByRepository(repositoryId: string) {
    return this.prisma.pullRequest.findMany({
      where: { repositoryId },
      orderBy: { createdAt: 'desc' },
      include: { files: true },
    });
  }

  /**
   * Return all PRs the authenticated user can see (across all their repos),
   * with optional filters. Includes the parent repository name for display.
   */
  async findAllForUser(
    userId: string,
    filters: {
      repositoryId?: string;
      status?: string;
      author?: string;
      since?: Date;
    } = {},
  ) {
    return this.prisma.pullRequest.findMany({
      where: {
        repository: {
          installation: { userId },
          ...(filters.repositoryId ? { id: filters.repositoryId } : {}),
        },
        ...(filters.status ? { status: filters.status as any } : {}),
        ...(filters.author ? { author: filters.author } : {}),
        ...(filters.since ? { createdAt: { gte: filters.since } } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        repository: {
          select: { id: true, owner: true, name: true, fullName: true },
        },
      },
    });
  }

  /**
   * Return a single PR by its internal UUID, scoped to the user.
   * Includes files and the latest review with its comments.
   */
  async findByIdForUser(id: string, userId: string) {
    return this.prisma.pullRequest.findFirst({
      where: {
        id,
        repository: { installation: { userId } },
      },
      include: {
        repository: {
          select: { id: true, owner: true, name: true, fullName: true },
        },
        files: { orderBy: { filename: 'asc' } },
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { comments: { orderBy: { createdAt: 'asc' } } },
        },
      },
    });
  }
}
