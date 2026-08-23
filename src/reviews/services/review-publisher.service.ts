import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { GithubService } from 'src/github/github.service'; // ADJUST: match your real path

@Injectable()
export class ReviewPublisherService {
  private readonly logger = new Logger(ReviewPublisherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly github: GithubService,
  ) {}

  async publish(reviewId: string): Promise<void> {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        pullRequest: {
          include: {
            repository: {
              select: {
                owner: true,
                name: true,
                installation: { select: { githubInstallationId: true } },
              },
            },
          },
        },
        comments: { where: { postedToGithub: false } },
      },
    });
    if (!review) throw new NotFoundException('Review not found');

    const pr = review.pullRequest;

    const installationId = Number(pr.repository.installation.githubInstallationId);

    // ADJUST: shape this call to match your real GithubService signature.
    const githubReviewId = await this.github.createPullRequestReview({
      owner: pr.repository.owner,
      repo: pr.repository.name,
      prNumber: pr.githubPrNumber,
      installationId,
      body: review.summary ?? 'PR Sentinel review',
      comments: review.comments
        .filter((c) => c.lineNumber !== null)
        .map((c) => ({
          path: c.filePath,
          line: c.lineNumber as number,
          body: this.formatCommentBody(c.severity, c.category, c.message),
        })),
    });

    await this.prisma.reviewComment.updateMany({
      where: { reviewId: review.id, postedToGithub: false },
      data: { postedToGithub: true, githubCommentId: githubReviewId },
    });

    this.logger.log(`Published review ${review.id} to GitHub PR #${pr.githubPrNumber}`);
  }

  private formatCommentBody(
    severity: string | null,
    category: string | null,
    message: string,
  ): string {
    const tag = severity ? `**[${severity}]**` : '';
    const cat = category ? ` \`${category}\`` : '';
    return `${tag}${cat} ${message}`.trim();
  }
}