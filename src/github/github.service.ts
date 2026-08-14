import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createAppAuth } from '@octokit/auth-app';
import axios from 'axios';
import * as fs from 'fs';

export interface GitHubInstallationInfo {
  id: number;
  accountLogin: string;
  accountAvatarUrl: string;
  accountType: string;          // "User" | "Organization"
  repositorySelection: string;  // "all" | "selected"
  appSlug: string;
}

@Injectable()
export class GithubService implements OnModuleInit {
  private readonly logger = new Logger(GithubService.name);

  onModuleInit() {
    try {
      this.getPrivateKey();
      if (!process.env.GITHUB_APP_ID) {
        throw new Error('GITHUB_APP_ID is not configured');
      }
      this.logger.log('GitHub App credentials loaded');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `GitHub App not configured — install/webhook flows will fail: ${msg}`,
      );
    }
  }

  /**
   * Resolve the GitHub App private key.
   *
   * Priority:
   *   1. GITHUB_APP_PRIVATE_KEY env var — inline PEM content (preferred for
   *      production environments where file system access is restricted).
   *   2. GITHUB_PRIVATE_KEY_PATH env var — path to a PEM file on disk
   *      (convenient for local development).
   *
   * The key must be a valid RSA private key in PEM format.
   * Never log or expose this value.
   */
  private getPrivateKey(): string {
    const inline = process.env.GITHUB_APP_PRIVATE_KEY;
    if (inline) {
      // Support both raw newlines and literal '\n' escape sequences that some
      // secret managers inject.
      return inline.replace(/\\n/g, '\n');
    }

    const path = process.env.GITHUB_PRIVATE_KEY_PATH;
    if (path) {
      return fs.readFileSync(path, 'utf8');
    }

    throw new Error(
      'GitHub App private key not configured. ' +
        'Set GITHUB_APP_PRIVATE_KEY (inline PEM) or GITHUB_PRIVATE_KEY_PATH (file path).',
    );
  }

  private getAppAuth() {
    const appId = process.env.GITHUB_APP_ID;
    if (!appId) throw new Error('GITHUB_APP_ID is not configured');

    return createAppAuth({
      appId: Number(appId),
      privateKey: this.getPrivateKey(),
    });
  }

  /**
   * Generate an installation access token for the given installation.
   * Used to call GitHub APIs on behalf of the installation (e.g. list files).
   * Never return this token to the browser.
   */
  async getInstallationToken(installationId: number): Promise<string> {
    const auth = this.getAppAuth();
    const { token } = await auth({ type: 'installation', installationId });
    return token;
  }

  /**
   * Verify that the given installation_id actually belongs to our GitHub App
   * by fetching it via the App JWT.  Returns the account metadata.
   * Throws if GitHub returns a non-2xx (e.g. 404 for a spoofed id).
   */
  async verifyInstallationWithGitHub(
    installationId: number,
  ): Promise<GitHubInstallationInfo> {
    const auth = this.getAppAuth();
    const { token } = await auth({ type: 'app' });

    try {
      const response = await axios.get(
        `https://api.github.com/app/installations/${installationId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );

      const data = response.data;
      this.logger.log(
        `Verified installation ${installationId}: account=${data.account.login}`,
      );

      return {
        id: data.id,
        accountLogin: data.account.login,
        accountAvatarUrl: data.account.avatar_url,
        accountType: data.account.type,
        repositorySelection: data.repository_selection,
        appSlug: data.app_slug,
      };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const ghMessage =
          (err.response?.data as { message?: string } | undefined)?.message ??
          err.message;
        this.logger.error(
          `GitHub installation verify failed: installationId=${installationId} status=${status} message=${ghMessage}`,
        );
        if (status === 401 || status === 403) {
          throw new Error(
            'GitHub App authentication failed. Check GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY on the server.',
          );
        }
        if (status === 404) {
          throw new Error(
            `GitHub installation ${installationId} was not found for this GitHub App.`,
          );
        }
      }
      throw err;
    }
  }

  /**
   * List all repositories accessible to the given installation.
   * Uses an installation token (not the App JWT).
   * Paginates automatically — GitHub caps at 100 per page.
   */
  async listInstallationRepositories(installationId: number): Promise<
    Array<{
      id: number;
      name: string;
      full_name: string;
      private: boolean;
      html_url: string;
    }>
  > {
    const token = await this.getInstallationToken(installationId);
    const results: Array<{
      id: number;
      name: string;
      full_name: string;
      private: boolean;
      html_url: string;
    }> = [];
    let page = 1;

    while (true) {
      const response = await axios.get<{
        total_count: number;
        repositories: typeof results;
      }>('https://api.github.com/installation/repositories', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        params: { per_page: 100, page },
      });

      results.push(...response.data.repositories);
      if (results.length >= response.data.total_count) break;
      page++;
    }

    this.logger.log(
      `Listed ${results.length} repo(s) for installation ${installationId}`,
    );
    return results;
  }

  /**
   * Fetch the changed files for a pull request.
   * Uses the installation access token.
   */
  async getPullRequestFiles(
    owner: string,
    repo: string,
    pullNumber: number,
    token: string,
  ) {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/files`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });

    this.logger.log(
      `Fetched ${response.data.length} changed file(s) for ${owner}/${repo}#${pullNumber}`,
    );
    return response.data;
  }
}
