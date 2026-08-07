import { Injectable, Logger } from '@nestjs/common';
import { createAppAuth } from '@octokit/auth-app';
import axios from 'axios';
import * as fs from 'fs';

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  private getPrivateKey(): string {
    const path = process.env.GITHUB_PRIVATE_KEY_PATH;
    if (!path) {
      throw new Error('GITHUB_PRIVATE_KEY_PATH is not configured');
    }
    return fs.readFileSync(path, 'utf8');
  }

  async getInstallationToken(
    installationId: number,
  ): Promise<string> {
    const appId = process.env.GITHUB_APP_ID;
    if (!appId) {
      throw new Error('GITHUB_APP_ID is not configured');
    }

    const auth = createAppAuth({
      appId: Number(appId),
      privateKey: this.getPrivateKey(),
      installationId,
    });

    const { token } = await auth({ type: 'installation' });
    return token;
  }

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

    this.logger.log(`Fetched ${response.data.length} changed files for ${owner}/${repo}#${pullNumber}`);
    return response.data;
  }
}
