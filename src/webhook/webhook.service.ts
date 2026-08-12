import { Injectable, Logger } from '@nestjs/common';
import { GithubService } from '../github/github.service';
import { RepositoryService } from 'src/repository/repository.service';
import { PullRequestService } from 'src/pull-request/pull-request.service';
import { GithubEvents } from './constants/github-events';
import {
  PullRequestWebhookPayload,
  PullRequestTriggerAction,
  InstallationWebhookPayload,
  InstallationRepositoriesWebhookPayload,
  RawWebhookHeaders,
} from './types/github-webhook.types';

/** Actions on pull_request events that should trigger a code review. */
const PR_TRIGGER_ACTIONS = new Set<PullRequestTriggerAction>([
  'opened',
  'synchronize',
  'reopened',
]);

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly githubService: GithubService,
    private readonly repositoryService: RepositoryService,
    private readonly pullRequestService: PullRequestService,
  ) {}

  // ─── Entry point ──────────────────────────────────────────────────────────

  async handleGithubWebhook(payload: any, headers: RawWebhookHeaders) {
    const event = headers['x-github-event'];
    const delivery = headers['x-github-delivery'];
    const action = payload.action as string | undefined;

    this.logger.log('========== WEBHOOK ==========');
    this.logger.log(`Event    : ${event}`);
    this.logger.log(`Action   : ${action}`);
    this.logger.log(`Delivery : ${delivery}`);

    switch (event) {
      case GithubEvents.PullRequest:
        return this.handlePullRequestEvent(
          payload as PullRequestWebhookPayload,
          delivery,
        );

      case GithubEvents.Installation:
        return this.handleInstallationEvent(
          payload as InstallationWebhookPayload,
        );

      case GithubEvents.InstallationRepositories:
        return this.handleInstallationRepositoriesEvent(
          payload as InstallationRepositoriesWebhookPayload,
        );

      case GithubEvents.Ping:
        this.logger.log('Ping received — webhook is configured correctly');
        return { success: true, event };

      default:
        this.logger.log(`Unhandled event type: ${event}`);
        return {
          success: true,
          event,
          message: 'Event received but not processed',
        };
    }
  } 

  // ─── pull_request ─────────────────────────────────────────────────────────

  private async handlePullRequestEvent(
    payload: PullRequestWebhookPayload,
    delivery: string,
  ) {
    const { action, pull_request: pr, repository, installation } = payload;

    this.logger.log(`Repository : ${repository.full_name}`);
    this.logger.log(`PR#        : ${pr.number} — ${pr.title}`);
    this.logger.log(`Author     : ${pr.user.login}`);
    this.logger.log(`Head→Base  : ${pr.head.ref} → ${pr.base.ref}`);

    if (!PR_TRIGGER_ACTIONS.has(action as PullRequestTriggerAction)) {
      this.logger.log(`Skipping pull_request action: ${action}`);
      return {
        success: true,
        event: GithubEvents.PullRequest,
        action,
        message: 'Action not processed',
      };
    }

    const installationId = installation?.id;
    if (!installationId) {
      this.logger.warn(
        'No installation.id in pull_request payload — cannot persist',
      );
      return { success: false, error: 'Missing installation context' };
    }

    // Guard: refuse to process PRs for a suspended installation.
    const installationRecord =
      await this.repositoryService.findInstallationByGithubId(installationId);
    // Use loose property access — the 'suspended' field is present at runtime
    // (schema migrated + client regenerated) but the watch compiler may infer
    // a stale type from the generated Prisma client. The nullish coalesce to
    // false ensures we never accidentally block on undefined.
    const isSuspended: boolean = (installationRecord as any)?.suspended ?? false;
    if (isSuspended) {
      this.logger.warn(
        `Skipping pull_request for suspended installation ${installationId}`,
      );
      return {
        success: false,
        error: 'Installation is suspended',
      };
    }

    // Find or create the repository row.
    const repoRecord = await this.findOrUpsertRepository(
      installationId,
      repository,
    );

    if (!repoRecord) {
      return {
        success: false,
        error:
          'Repository not found and could not be created — ' +
          'installation not linked to a user yet',
      };
    }

    // Upsert the PullRequest row (idempotent on githubPrId + deliveryId).
    const prRecord = await this.pullRequestService.upsertPullRequest(
      repoRecord.id,
      pr,
      action as PullRequestTriggerAction,
      delivery,
    );

    if (!prRecord) {
      return {
        success: true,
        event: GithubEvents.PullRequest,
        action,
        message: 'Duplicate delivery skipped',
      };
    }

    // Fetch changed files and persist PrFile rows.-
    let filesCount = 0;
    try {
      const token =
        await this.githubService.getInstallationToken(installationId);
      const files = await this.githubService.getPullRequestFiles(
        repository.owner.login,
        repository.name,
        pr.number,
        token,
      );

      await this.pullRequestService.replacePrFiles(prRecord.id, files);
      filesCount = files.length;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to fetch/save PR files: ${message}`);
      await this.pullRequestService.markFailed(
        prRecord.id,
        `File fetch failed: ${message}`,
      );
    }

    return {
      success: true,
      event: GithubEvents.PullRequest,
      action,
      repository: repository.full_name,
      pr: {
        id: prRecord.id,
        number: pr.number,
        title: pr.title,
        author: pr.user.login,
        head: pr.head.ref,
        base: pr.base.ref,
        status: prRecord.status,
      },
      filesCount,
    };
  }

  // ─── installation ─────────────────────────────────────────────────────────

  private async handleInstallationEvent(payload: InstallationWebhookPayload) {
    this.logger.log(
      `Installation ${payload.action}: ` +
        `id=${payload.installation.id} ` +
        `account=${payload.installation.account.login}`,
    );

    // userId is always null when the webhook arrives — GitHub has no way to
    // know which PR Sentinel user owns the installation.  The userId is
    // established when the user completes the browser install flow
    // (GET /github/install/complete) which calls upsertInstallationWithUser().
    await this.repositoryService.handleInstallationEvent(payload, null);

    return {
      success: true,
      event: GithubEvents.Installation,
      action: payload.action,
      installationId: payload.installation.id,
    };
  }

  // ─── installation_repositories ────────────────────────────────────────────

  private async handleInstallationRepositoriesEvent(
    payload: InstallationRepositoriesWebhookPayload,
  ) {
    this.logger.log(
      `InstallationRepositories ${payload.action}: ` +
        `+${payload.repositories_added.length} / ` +
        `-${payload.repositories_removed.length}`,
    );

    await this.repositoryService.handleInstallationRepositoriesEvent(payload);

    return {
      success: true,
      event: GithubEvents.InstallationRepositories,
      action: payload.action,
      added: payload.repositories_added.map((r) => r.full_name),
      removed: payload.repositories_removed.map((r) => r.full_name),
    };
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  /**
   * Find an existing Repository row or create one if the installation row
   * already exists.  Returns null only when the installation row is absent
   * (extremely unlikely after the race-condition fix in RepositoryService).
   */
  private async findOrUpsertRepository(
    githubInstallationId: number,
    repository: PullRequestWebhookPayload['repository'],
  ) {
    // Fast path: repository already in DB.
    const existing = await this.repositoryService.findByGithubRepoId(
      repository.id,
    );
    if (existing) return existing;

    // Need the installation row's internal UUID to FK into.
    const installation =
      await this.repositoryService.findInstallationByGithubId(
        githubInstallationId,
      );
    if (!installation) return null;

    return this.repositoryService.upsertRepository(installation.id, {
      id: repository.id,
      name: repository.name,
      full_name: repository.full_name,
      private: repository.private,
    });
  }
}
