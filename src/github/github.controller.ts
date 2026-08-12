import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AuthenticatedUser } from 'src/auth/auth.types';
import { GithubService } from './github.service';
import { InstallStateService } from './install-state.service';
import { RepositoryService } from 'src/repository/repository.service';
import type { GitHubInstallationStatus } from './github.types';

type AuthedRequest = Request & { user: AuthenticatedUser };

function isSuspended(installation: Record<string, unknown> | null | undefined): boolean {
  return (installation as any)?.suspended === true;
}

/**
 * Shared helper: verify installation with GitHub, upsert it in DB, sync repos.
 * Used by both completeInstall and claimInstall to avoid duplication.
 */
async function verifyAndSync(
  githubInstallationId: number,
  userId: string,
  githubService: GithubService,
  repositoryService: RepositoryService,
  logger: Logger,
): Promise<GitHubInstallationStatus> {
  // Verify with GitHub API
  let info: Awaited<ReturnType<GithubService['verifyInstallationWithGitHub']>>;
  try {
    info = await githubService.verifyInstallationWithGitHub(githubInstallationId);
  } catch {
    throw new BadRequestException(
      "We couldn't verify your GitHub installation. " +
        'Please check that the PR Sentinel GitHub App is still installed and try again.',
    );
  }

  // Ownership conflict: reject if already owned by a DIFFERENT user
  const existingInstallation =
    await repositoryService.findInstallationByGithubId(githubInstallationId);

  if (
    existingInstallation?.userId != null &&
    existingInstallation.userId !== userId
  ) {
    logger.warn(
      `Ownership conflict: githubInstallationId=${githubInstallationId} ` +
        `owned by userId=${existingInstallation.userId}, attempted by userId=${userId}`,
    );
    throw new ForbiddenException(
      'This GitHub installation is already connected to another PR Sentinel account. ' +
        'Please uninstall the PR Sentinel GitHub App from GitHub and reinstall it.',
    );
  }

  // Upsert Installation row
  const installation = await repositoryService.upsertInstallationWithUser(
    githubInstallationId,
    userId,
    info.accountLogin,
    info.accountAvatarUrl,
  );

  // Sync repositories
  let syncResult = { synced: 0, deactivated: 0 };
  try {
    const githubRepos = await githubService.listInstallationRepositories(githubInstallationId);
    syncResult = await repositoryService.syncInstallationRepositories(
      installation.id,
      githubInstallationId,
      githubRepos,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Repo sync failed (non-fatal): ${msg}`);
  }

  logger.log(
    `Install linked: githubInstallationId=${githubInstallationId} ` +
      `user=${userId} synced=${syncResult.synced} deactivated=${syncResult.deactivated}`,
  );

  return {
    connected: true,
    installation: {
      id: installation.id,
      githubInstallationId: installation.githubInstallationId,
      userId: installation.userId,
      accountLogin: installation.accountLogin ?? null,
      accountAvatarUrl: installation.accountAvatarUrl ?? null,
      suspended: isSuspended(installation),
      createdAt: installation.createdAt.toISOString(),
      updatedAt: installation.updatedAt.toISOString(),
    },
    repositoryCount: syncResult.synced,
  };
}

@Controller('github')
@UseGuards(JwtAuthGuard)
export class GithubController {
  private readonly logger = new Logger(GithubController.name);

  constructor(
    private readonly githubService: GithubService,
    private readonly installStateService: InstallStateService,
    private readonly repositoryService: RepositoryService,
    private readonly configService: ConfigService,
  ) {}

  // ─── POST /api/github/install/start ───────────────────────────────────────
  //
  // Step 1: generate a Redis-backed state token and return the GitHub App
  // installation URL with the state appended.

  @Post('install/start')
  @HttpCode(HttpStatus.OK)
  async startInstall(@Req() req: AuthedRequest): Promise<{ installUrl: string }> {
    const userId = req.user.id;
    const state = await this.installStateService.create(userId);

    const baseUrl = this.getRequiredConfig('GITHUB_APP_INSTALL_URL');
    const installUrl = `${baseUrl}?state=${state}`;

    this.logger.log(`Install start: user=${userId} state=${state.slice(0, 8)}…`);
    return { installUrl };
  }

  // ─── GET /api/github/install/complete ─────────────────────────────────────
  //
  // Step 2: GitHub redirects back here (via the frontend setup page) after
  // installation.
  //
  // STATE IS OPTIONAL.
  //
  // GitHub only echoes the `state` param back on a *fresh* installation.
  // When the app was already installed and the user is re-visiting the GitHub
  // App page, GitHub redirects to the Setup URL without state.
  //
  // Security model:
  //   • With state    → validate Redis token, confirm JWT user matches.
  //   • Without state → allow only if installation is unclaimed OR already
  //                     owned by the JWT user (no CSRF risk because the JWT
  //                     cookie proves identity).

  @Get('install/complete')
  async completeInstall(
    @Req() req: AuthedRequest,
    @Query('installation_id') rawInstallationId?: string,
    @Query('state') state?: string,
    @Query('setup_action') _setupAction?: string,
  ): Promise<GitHubInstallationStatus> {
    // installation_id is always required
    if (!rawInstallationId) {
      throw new BadRequestException(
        'Missing installation_id. GitHub did not supply a valid installation.',
      );
    }

    const githubInstallationId = Number(rawInstallationId);
    if (!Number.isInteger(githubInstallationId) || githubInstallationId <= 0) {
      throw new BadRequestException('installation_id must be a positive integer.');
    }

    let verifiedUserId: string;

    if (state) {
      // ── Full state-validated path (new installation) ───────────────────
      const stateUserId = await this.installStateService.consume(state);
      if (!stateUserId) {
        throw new UnauthorizedException(
          'This GitHub connection request has expired or has already been used. ' +
            'Please start the connection flow again.',
        );
      }

      if (req.user.id !== stateUserId) {
        this.logger.warn(
          `State userId mismatch: jwt=${req.user.id} state=${stateUserId}`,
        );
        throw new UnauthorizedException(
          'Session mismatch. Please log in again and retry.',
        );
      }

      verifiedUserId = stateUserId;
      this.logger.log(
        `completeInstall (with state): githubInstallationId=${githubInstallationId} user=${verifiedUserId}`,
      );
    } else {
      // ── No-state path (app already installed, GitHub omits state) ──────
      // Safe because the JWT cookie already proves identity. We only allow
      // this when the installation is unclaimed or already belongs to this user.
      const existing = await this.repositoryService.findInstallationByGithubId(
        githubInstallationId,
      );

      if (existing?.userId != null && existing.userId !== req.user.id) {
        this.logger.warn(
          `No-state complete rejected: installation ${githubInstallationId} ` +
            `owned by ${existing.userId}, attempted by ${req.user.id}`,
        );
        throw new ForbiddenException(
          'This GitHub installation is already connected to another PR Sentinel account.',
        );
      }

      verifiedUserId = req.user.id;
      this.logger.log(
        `completeInstall (no state, app already installed): ` +
          `githubInstallationId=${githubInstallationId} user=${verifiedUserId}`,
      );
    }

    return verifyAndSync(
      githubInstallationId,
      verifiedUserId,
      this.githubService,
      this.repositoryService,
      this.logger,
    );
  }

  // ─── POST /api/github/install/claim ───────────────────────────────────────
  //
  // State-free claim for the "app already installed" case.
  // Called by the frontend when it has an installation_id but no state
  // (e.g. the user navigated directly to the GitHub App page and GitHub
  // redirected back without a state token).
  //
  // Requires: valid JWT cookie (proves identity).
  // Body: { installationId: number }
  //
  // Security: identical ownership checks as completeInstall without-state.
  // No state token → no CSRF protection needed because the JWT cookie is
  // same-site and HttpOnly — a cross-origin attacker cannot read it.

  @Post('install/claim')
  @HttpCode(HttpStatus.OK)
  async claimInstall(
    @Req() req: AuthedRequest,
    @Body('installationId') rawInstallationId: number | string | undefined,
  ): Promise<GitHubInstallationStatus> {
    if (!rawInstallationId) {
      throw new BadRequestException('installationId is required.');
    }

    const githubInstallationId = Number(rawInstallationId);
    if (!Number.isInteger(githubInstallationId) || githubInstallationId <= 0) {
      throw new BadRequestException('installationId must be a positive integer.');
    }

    const userId = req.user.id;

    // Reject if already owned by a different user
    const existing = await this.repositoryService.findInstallationByGithubId(
      githubInstallationId,
    );

    if (existing?.userId != null && existing.userId !== userId) {
      this.logger.warn(
        `Claim rejected: installation ${githubInstallationId} ` +
          `owned by ${existing.userId}, attempted by ${userId}`,
      );
      throw new ForbiddenException(
        'This GitHub installation is already connected to another PR Sentinel account.',
      );
    }

    this.logger.log(
      `claimInstall: githubInstallationId=${githubInstallationId} user=${userId}`,
    );

    return verifyAndSync(
      githubInstallationId,
      userId,
      this.githubService,
      this.repositoryService,
      this.logger,
    );
  }

  // ─── GET /api/github/installation/status ──────────────────────────────────

  @Get('installation/status')
  async getInstallationStatus(@Req() req: AuthedRequest): Promise<
    GitHubInstallationStatus & {
      repositories: Array<{
        id: string;
        githubRepoId: number;
        owner: string;
        name: string;
        fullName: string;
        isActive: boolean;
        htmlUrl: string | null;
      }>;
    }
  > {
    const userId = req.user.id;
    const installation = await this.repositoryService.findInstallationByUserId(userId);

    if (!installation) {
      return { connected: false, installation: null, repositoryCount: 0, repositories: [] };
    }

    const repos = await this.repositoryService.findActiveReposByUserId(userId);

    return {
      connected: !isSuspended(installation),
      installation: {
        id: installation.id,
        githubInstallationId: installation.githubInstallationId,
        userId: installation.userId,
        accountLogin: installation.accountLogin ?? null,
        accountAvatarUrl: installation.accountAvatarUrl ?? null,
        suspended: isSuspended(installation),
        createdAt: installation.createdAt.toISOString(),
        updatedAt: installation.updatedAt.toISOString(),
      },
      repositoryCount: installation._count.repositories,
      repositories: repos.map((r) => ({
        id: r.id,
        githubRepoId: r.githubRepoId,
        owner: r.owner,
        name: r.name,
        fullName: r.fullName,
        isActive: r.isActive,
        htmlUrl: r.htmlUrl ?? null,
      })),
    };
  }

  // ─── POST /api/github/installation/sync ───────────────────────────────────

  @Post('installation/sync')
  @HttpCode(HttpStatus.OK)
  async syncInstallation(@Req() req: AuthedRequest): Promise<{
    synced: number;
    deactivated: number;
    repositories: Array<{
      id: string;
      githubRepoId: number;
      owner: string;
      name: string;
      fullName: string;
      isActive: boolean;
      htmlUrl: string | null;
    }>;
  }> {
    const userId = req.user.id;
    const installation = await this.repositoryService.findInstallationByUserId(userId);

    if (!installation) {
      throw new NotFoundException(
        'GitHub App is not connected to this account. Please install the GitHub App first.',
      );
    }

    if (isSuspended(installation)) {
      throw new NotFoundException(
        'GitHub App installation is suspended. Please resolve the issue in GitHub and reconnect.',
      );
    }

    const { githubInstallationId } = installation;
    this.logger.log(`Sync requested: user=${userId} githubInstallationId=${githubInstallationId}`);

    let githubRepos: Awaited<ReturnType<GithubService['listInstallationRepositories']>>;
    try {
      githubRepos = await this.githubService.listInstallationRepositories(githubInstallationId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `GitHub API call failed during sync: user=${userId} installation=${githubInstallationId} err=${msg}`,
      );
      throw new NotFoundException(
        'Could not retrieve repositories from GitHub. ' +
          'Please verify the GitHub App is still installed and try again.',
      );
    }

    const syncResult = await this.repositoryService.syncInstallationRepositories(
      installation.id,
      githubInstallationId,
      githubRepos,
    );

    const repos = await this.repositoryService.findActiveReposByUserId(userId);

    this.logger.log(
      `Sync complete: user=${userId} githubInstallationId=${githubInstallationId} ` +
        `synced=${syncResult.synced} deactivated=${syncResult.deactivated}`,
    );

    return {
      synced: syncResult.synced,
      deactivated: syncResult.deactivated,
      repositories: repos.map((r) => ({
        id: r.id,
        githubRepoId: r.githubRepoId,
        owner: r.owner,
        name: r.name,
        fullName: r.fullName,
        isActive: r.isActive,
        htmlUrl: r.htmlUrl ?? null,
      })),
    };
  }

  // ─── GET /api/github/installation ─────────────────────────────────────────

  @Get('installation')
  async getInstallation(@Req() req: AuthedRequest): Promise<GitHubInstallationStatus> {
    const userId = req.user.id;
    const installation = await this.repositoryService.findInstallationByUserId(userId);

    if (!installation) {
      return { connected: false, installation: null, repositoryCount: 0 };
    }

    return {
      connected: !isSuspended(installation),
      installation: {
        id: installation.id,
        githubInstallationId: installation.githubInstallationId,
        userId: installation.userId,
        accountLogin: installation.accountLogin ?? null,
        accountAvatarUrl: installation.accountAvatarUrl ?? null,
        suspended: isSuspended(installation),
        createdAt: installation.createdAt.toISOString(),
        updatedAt: installation.updatedAt.toISOString(),
      },
      repositoryCount: installation._count.repositories,
    };
  }

  // ─── GET /api/github/repositories ─────────────────────────────────────────

  @Get('repositories')
  async getRepositories(@Req() req: AuthedRequest) {
    const userId = req.user.id;
    const installation = await this.repositoryService.findInstallationByUserId(userId);
    if (!installation) {
      throw new NotFoundException('No GitHub installation found for this account.');
    }

    const repos = await this.repositoryService.findActiveReposByUserId(userId);
    return repos.map((r) => ({
      id: r.id,
      githubRepoId: r.githubRepoId,
      owner: r.owner,
      name: r.name,
      fullName: r.fullName,
      isActive: r.isActive,
      installationId: r.installationId,
      htmlUrl: r.htmlUrl ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private getRequiredConfig(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new InternalServerErrorException(`${key} is not configured`);
    }
    return value;
  }
}
