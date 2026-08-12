import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type { Installation } from 'src/generated/prisma/client';
import {
  InstallationWebhookPayload,
  InstallationRepositoriesWebhookPayload,
} from 'src/webhook/types/github-webhook.types';

@Injectable()
export class RepositoryService {
  private readonly logger = new Logger(RepositoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Installation ──────────────────────────────────────────────────────────

  /**
   * Upsert an Installation record.
   *
   * This is called by the `installation` webhook handler where userId is
   * always null (GitHub doesn't know which PR Sentinel user owns the
   * installation until the user completes the browser-side install flow).
   *
   * - If a row already exists → update account metadata, leave userId alone.
   * - If no row exists → create a placeholder with userId = null.
   *   The placeholder is claimed later by upsertInstallationWithUser().
   */
  async upsertInstallation(
    githubInstallationId: number,
    userId: string | null,
  ) {
    const installation = await this.prisma.installation.upsert({
      where: { githubInstallationId },
      create: {
        githubInstallationId,
        userId, // may be null — claimed later
        suspended: false,
      },
      update: {
        // Never overwrite userId here — ownership is established separately.
        suspended: false,
        updatedAt: new Date(),
      },
    });

    this.logger.log(
      `Installation upserted: id=${installation.id} ` +
        `githubInstallationId=${githubInstallationId} ` +
        `userId=${installation.userId ?? 'null (unclaimed)'}`,
    );
    return installation;
  }

  /** Hard-delete an installation.  Cascades to Repository → PullRequest. */
  async deleteInstallation(githubInstallationId: number) {
    const existing = await this.prisma.installation.findUnique({
      where: { githubInstallationId },
    });

    if (!existing) {
      this.logger.warn(
        `Installation ${githubInstallationId} not found — nothing to delete`,
      );
      return;
    }

    await this.prisma.installation.delete({ where: { githubInstallationId } });
    this.logger.log(`Installation ${githubInstallationId} deleted`);
  }

  /**
   * Mark the installation as suspended.
   * Does NOT delete it — suspended installations keep their data so the user
   * can see the "suspended" state in the UI and reconnect.
   */
  async suspendInstallation(githubInstallationId: number) {
    const existing = await this.prisma.installation.findUnique({
      where: { githubInstallationId },
    });

    if (!existing) {
      // Webhook beat the install flow — create a suspended placeholder.
      await this.prisma.installation.create({
        data: { githubInstallationId, userId: null, suspended: true },
      });
      this.logger.warn(
        `Installation ${githubInstallationId} not found on suspend — created suspended placeholder`,
      );
      return;
    }

    await this.prisma.installation.update({
      where: { githubInstallationId },
      data: { suspended: true, updatedAt: new Date() },
    });
    this.logger.log(`Installation ${githubInstallationId} suspended`);
  }

  /**
   * Mark the installation as active again and re-sync repositories.
   * Called on `unsuspend` webhook action.
   */
  async unsuspendInstallation(githubInstallationId: number) {
    const existing = await this.prisma.installation.findUnique({
      where: { githubInstallationId },
    });

    if (!existing) {
      this.logger.warn(
        `Installation ${githubInstallationId} not found on unsuspend — ignoring`,
      );
      return;
    }

    await this.prisma.installation.update({
      where: { githubInstallationId },
      data: { suspended: false, updatedAt: new Date() },
    });
    this.logger.log(`Installation ${githubInstallationId} unsuspended`);
  }

  // ─── Repository ────────────────────────────────────────────────────────────

  /**
   * Upsert a Repository record under a known Installation (by internal UUID).
   * `owner` is derived from the repo's full_name ("owner/name").
   * Uses githubRepoId as the idempotency key.
   */
  async upsertRepository(
    installationId: string,
    repo: {
      id: number;
      name: string;
      full_name: string;
      private: boolean;
      html_url?: string;
    },
  ) {
    const [owner] = repo.full_name.split('/');

    const repository = await this.prisma.repository.upsert({
      where: { githubRepoId: repo.id },
      create: {
        githubRepoId: repo.id,
        owner,
        name: repo.name,
        fullName: repo.full_name,
        htmlUrl: repo.html_url ?? null,
        isActive: true,
        installationId,
      },
      update: {
        owner,
        name: repo.name,
        fullName: repo.full_name,
        htmlUrl: repo.html_url ?? undefined,
        isActive: true, // re-activate if previously soft-deactivated
        installationId,
        updatedAt: new Date(),
      },
    });

    this.logger.log(
      `Repository upserted: ${repo.full_name} (githubRepoId=${repo.id})`,
    );
    return repository;
  }

  /** Soft-deactivate a repository (isActive = false). */
  async deactivateRepository(githubRepoId: number) {
    const existing = await this.prisma.repository.findUnique({
      where: { githubRepoId },
    });

    if (!existing) {
      this.logger.warn(
        `Repository githubRepoId=${githubRepoId} not found — nothing to deactivate`,
      );
      return;
    }

    await this.prisma.repository.update({
      where: { githubRepoId },
      data: { isActive: false, updatedAt: new Date() },
    });

    this.logger.log(`Repository githubRepoId=${githubRepoId} deactivated`);
  }

  // ─── Lookup helpers ────────────────────────────────────────────────────────

  async findInstallationByGithubId(
    githubInstallationId: number,
  ): Promise<Installation | null> {
    return this.prisma.installation.findUnique({
      where: { githubInstallationId },
    });
  }

  /** Find the installation belonging to a given user (includes active repo count). */
  async findInstallationByUserId(userId: string) {
    return this.prisma.installation.findFirst({
      where: { userId },
      include: {
        _count: {
          select: { repositories: { where: { isActive: true } } },
        },
      },
    });
  }

  /**
   * Link an installation to a user and persist GitHub account metadata.
   *
   * - On CREATE: sets userId, accountLogin, accountAvatarUrl, suspended=false.
   * - On UPDATE: writes userId ONLY when the existing row has no owner yet
   *   (webhook-created placeholder). This is the "claim" operation.
   *   Never overwrites an existing userId — ownership transfer must go through
   *   explicit uninstall → reinstall.
   */
  async upsertInstallationWithUser(
    githubInstallationId: number,
    userId: string,
    accountLogin: string,
    accountAvatarUrl: string,
  ) {
    const existing = await this.prisma.installation.findUnique({
      where: { githubInstallationId },
    });

    const installation = await this.prisma.installation.upsert({
      where: { githubInstallationId },
      create: {
        githubInstallationId,
        userId,
        accountLogin,
        accountAvatarUrl,
        suspended: false,
      },
      update: {
        // Claim unclaimed placeholder, but never transfer ownership.
        ...(existing?.userId == null ? { userId } : {}),
        accountLogin,
        accountAvatarUrl,
        suspended: false, // unsuspend on reconnect
        updatedAt: new Date(),
      },
    });

    this.logger.log(
      `Installation linked: githubInstallationId=${githubInstallationId} userId=${userId}`,
    );
    return installation;
  }

  /** Return all active repos belonging to the user's installation. */
  async findActiveReposByUserId(userId: string) {
    return this.prisma.repository.findMany({
      where: {
        isActive: true,
        installation: { userId },
      },
      orderBy: { fullName: 'asc' },
    });
  }

  async findByGithubRepoId(githubRepoId: number) {
    return this.prisma.repository.findUnique({
      where: { githubRepoId },
    });
  }

  /**
   * Full repository synchronization for one installation.
   *
   * Algorithm:
   *   1. Fetch all repos currently accessible to the GitHub installation.
   *   2. Upsert each returned repo as active.
   *   3. Find repos in our DB (for this installation) that were NOT returned
   *      by GitHub and set them inactive — they have been removed or
   *      de-selected in the GitHub App settings.
   *
   * This method is idempotent — running it twice is safe.
   * It does NOT delete any rows so PR/review history is preserved.
   *
   * @param installationDbId  Internal PostgreSQL UUID of the Installation row.
   * @param githubInstallationId  Numeric GitHub installation ID (used for the API call).
   * @param githubRepos  Already-fetched list from GitHub (avoids a double API call
   *                     when called from completeInstall which already fetched them).
   *                     Pass undefined to let this method fetch them.
   */
  async syncInstallationRepositories(
    installationDbId: string,
    githubInstallationId: number,
    githubRepos?: Array<{
      id: number;
      name: string;
      full_name: string;
      private: boolean;
      html_url: string;
    }>,
  ) {
    const syncLogger = new Logger('RepositorySync');

    syncLogger.log(
      `user=<via installationDbId> installation=${githubInstallationId} started`,
    );

    const repos = githubRepos ?? [];

    syncLogger.log(
      `installation=${githubInstallationId} githubRepositories=${repos.length}`,
    );

    // ── Upsert every repo GitHub returned ─────────────────────────────────
    const returnedGithubIds = new Set<number>();
    for (const repo of repos) {
      returnedGithubIds.add(repo.id);
      await this.upsertRepository(installationDbId, {
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        private: repo.private,
        html_url: repo.html_url,
      });
      syncLogger.log(
        `repo=${repo.full_name} githubRepoId=${repo.id} status=upserted`,
      );
    }

    // ── Deactivate repos that were previously active but not returned ─────
    const activeDbRepos = await this.prisma.repository.findMany({
      where: { installationId: installationDbId, isActive: true },
      select: { githubRepoId: true },
    });

    let deactivatedCount = 0;
    for (const dbRepo of activeDbRepos) {
      if (!returnedGithubIds.has(dbRepo.githubRepoId)) {
        await this.deactivateRepository(dbRepo.githubRepoId);
        deactivatedCount++;
      }
    }

    syncLogger.log(
      `installation=${githubInstallationId} synced=${repos.length} deactivated=${deactivatedCount}`,
    );

    return { synced: repos.length, deactivated: deactivatedCount };
  }

  /**
   * Return a single repository by its internal UUID, scoped to the user so
   * one user cannot read another user's repo.
   */
  async findByIdForUser(id: string, userId: string) {
    return this.prisma.repository.findFirst({
      where: { id, installation: { userId } },
      include: {
        _count: {
          select: { pullRequests: true },
        },
      },
    });
  }

  /**
   * Return all active repos for the user, enriched with PR + review counts
   * needed by the frontend repository card.
   */
  async findActiveReposWithCountsByUserId(userId: string) {
    return this.prisma.repository.findMany({
      where: {
        isActive: true,
        installation: { userId },
      },
      orderBy: { fullName: 'asc' },
      include: {
        _count: {
          select: { pullRequests: true },
        },
      },
    });
  }

  // ─── Webhook event handlers ────────────────────────────────────────────────

  /**
   * Handle a full `installation` webhook event.
   *
   * created              → upsert installation + seed repos
   * deleted              → hard-delete (cascades repos → PRs)
   * suspend              → mark suspended (keeps data)
   * unsuspend            → clear suspended flag
   * new_permissions_accepted → upsert (refresh metadata)
   */
  async handleInstallationEvent(
    payload: InstallationWebhookPayload,
    userId: string | null,
  ) {
    const { action, installation, repositories } = payload;

    this.logger.log(
      `Installation event: action=${action} ` +
        `githubInstallationId=${installation.id} ` +
        `account=${installation.account.login}`,
    );

    if (action === 'deleted') {
      await this.deleteInstallation(installation.id);
      return;
    }

    if (action === 'suspend') {
      await this.suspendInstallation(installation.id);
      return;
    }

    if (action === 'unsuspend') {
      await this.unsuspendInstallation(installation.id);
      return;
    }

    // created / new_permissions_accepted — upsert the installation row.
    // userId is null here because the webhook arrives without PR Sentinel
    // user context; it will be claimed via upsertInstallationWithUser() once
    // the user completes the browser-side install flow.
    const record = await this.upsertInstallation(installation.id, userId);

    // Seed any repositories that arrived with the installation event.
    if (record && repositories?.length) {
      for (const repo of repositories) {
        await this.upsertRepository(record.id, repo);
      }
      this.logger.log(
        `Seeded ${repositories.length} repo(s) for installation ${installation.id}`,
      );
    }
  }

  /**
   * Handle an `installation_repositories` webhook event.
   *
   * Adds new repos and soft-deactivates removed ones.
   * If the installation row doesn't exist yet (race condition — webhook beat
   * the `installation` event), creates a placeholder so repos can be stored.
   */
  async handleInstallationRepositoriesEvent(
    payload: InstallationRepositoriesWebhookPayload,
  ) {
    const { installation, repositories_added, repositories_removed } = payload;

    let record = await this.prisma.installation.findUnique({
      where: { githubInstallationId: installation.id },
    });

    if (!record) {
      // Race condition: `installation_repositories` arrived before
      // `installation`.  Create a placeholder; it will be claimed later.
      this.logger.warn(
        `Installation ${installation.id} missing on installation_repositories event — ` +
          `creating placeholder`,
      );
      record = await this.prisma.installation.create({
        data: {
          githubInstallationId: installation.id,
          userId: null,
          suspended: false,
        },
      });
    }

    for (const repo of repositories_added) {
      await this.upsertRepository(record.id, repo);
    }

    for (const repo of repositories_removed) {
      await this.deactivateRepository(repo.id);
    }

    this.logger.log(
      `installation_repositories: +${repositories_added.length} / ` +
        `-${repositories_removed.length} for installation ${installation.id}`,
    );
  }
}
