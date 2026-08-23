import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { GithubService } from 'src/github/github.service';
import { ReviewStatus, Severity } from 'src/generated/prisma/client';
import { FindingSeverity } from '../types/review-generation.types';
import {
  buildReviewSystemPrompt,
  buildReviewUserPrompt,
} from '../prompts/review-prompt.builder';
import { parseReviewResponse } from '../utils/parse-review-response';
import { LlmService } from 'src/llm/llm.service';

@Injectable()
export class ReviewGenerationService {
  private readonly logger = new Logger(ReviewGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly github: GithubService,
  ) {}

  /**
   * Full review cycle for one pull request: fetch diff -> LLM -> parse ->
   * persist -> return the created review's id. Posting back to GitHub is a
   * separate step (see ReviewPublisherService) so a GitHub API failure
   * doesn't wipe out an otherwise-successful review.
   */
  async runReview(pullRequestId: string, userId: string): Promise<string> {
    const pr = await this.prisma.pullRequest.findUnique({
      where: { id: pullRequestId },
      include: {
        repository: {
          select: {
            owner: true,
            name: true,
            fullName: true,
            installation: { select: { githubInstallationId: true } },
          },
        },
        files: { orderBy: { filename: 'asc' } },
      },
    });
    if (!pr) throw new NotFoundException('Pull request not found');

    const review = await this.prisma.review.create({
      data: {
        pullRequestId: pr.id,
        provider: 'OPENROUTER',
        status: ReviewStatus.PENDING,
      },
    });

    try {
      // Fetch the unified diff by concatenating per-file patches via the GitHub API.
      const installationId = Number(pr.repository.installation.githubInstallationId);
      const diff = await this.github.getPullRequestDiff(
        pr.repository.owner,
        pr.repository.name,
        pr.githubPrNumber,
        installationId,
      );

      if (!diff || diff.trim().length === 0) {
        throw new Error('Empty diff returned from GitHub — nothing to review');
      }

      const systemPrompt = buildReviewSystemPrompt();
      const userPrompt = buildReviewUserPrompt({
        repoFullName: pr.repository.fullName,
        prNumber: pr.githubPrNumber,
        prTitle: pr.title,
        prAuthor: pr.author,
        baseBranch: pr.baseBranch,
        headBranch: pr.headBranch,
        diff: this.truncateDiff(diff),
      });

      const llmResult = await this.llm.generateReview(userId, systemPrompt, userPrompt);
      const parsed = parseReviewResponse(llmResult.content);

      await this.prisma.$transaction([
        this.prisma.review.update({
          where: { id: review.id },
          data: {
            status: ReviewStatus.COMPLETED,
            summary: parsed.summary,
            errorMessage: null,
            updatedAt: new Date(),
          },
        }),
        ...(parsed.findings.length > 0
          ? [
              this.prisma.reviewComment.createMany({
                data: parsed.findings.map((f) => ({
                  reviewId: review.id,
                  filePath: f.filePath,
                  lineNumber: f.lineNumber,
                  severity: this.toDbSeverity(f.severity),
                  category: f.category,
                  message: f.message,
                  postedToGithub: false,
                })),
              }),
            ]
          : []),
      ]);

      this.logger.log(
        `Review ${review.id} completed for PR #${pr.githubPrNumber}: ${parsed.findings.length} findings`,
      );

      return review.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error during review';
      this.logger.error(`Review ${review.id} failed: ${message}`);

      await this.prisma.review.update({
        where: { id: review.id },
        data: { status: ReviewStatus.FAILED, errorMessage: message, updatedAt: new Date() },
      });

      throw err;
    }
  }

  /**
   * Map the LLM-side FindingSeverity to the Prisma Severity enum.
   * 'INFO' has no equivalent in the DB schema — treat it as null (informational).
   */
  private toDbSeverity(s: FindingSeverity): Severity | null {
    const map: Partial<Record<FindingSeverity, Severity>> = {
      CRITICAL: Severity.CRITICAL,
      HIGH: Severity.HIGH,
      MEDIUM: Severity.MEDIUM,
      LOW: Severity.LOW,
    };
    return map[s] ?? null;
  }

  private truncateDiff(diff: string, maxChars = 40_000): string {
    if (diff.length <= maxChars) return diff;
    return (
      diff.slice(0, maxChars) +
      `\n\n[... diff truncated, ${diff.length - maxChars} more characters omitted ...]`
    );
  }
}