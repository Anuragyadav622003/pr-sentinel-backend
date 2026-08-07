import {
  Injectable,
  Logger,
} from '@nestjs/common';

@Injectable()
export class WebhookService {
  private readonly logger =
    new Logger(WebhookService.name);

  async handleGithubWebhook(
    payload: any,
    headers: Record<string, string>,
  ) {
    const event = headers['x-github-event'];

    const delivery =
      headers['x-github-delivery'];

    const action = payload.action;

    // Try multiple locations for repository name because different GitHub
    // webhook events include repo info in different shapes.
    let repository: string | null =
      payload.repository?.full_name ||
      payload.pull_request?.repository?.full_name ||
      payload.pull_request?.base?.repo?.full_name ||
      payload.pull_request?.head?.repo?.full_name ||
      null;

    // installation_repositories and similar events provide arrays
    if (!repository && Array.isArray(payload.repositories_added)) {
      repository = payload.repositories_added
        .map((r: any) => r.full_name || r.name)
        .filter(Boolean)
        .join(', ');
    }


    this.logger.log(
      '========== WEBHOOK =========='
    );

    this.logger.log(`Event : ${event}`);

    this.logger.log(`Action : ${action}`);

    this.logger.log(`Repository : ${repository}`);

    // If this is a pull_request event, extract PR details for easier consumption
    if (payload.pull_request) {
      const pr = payload.pull_request;
      this.logger.log(`PR# : ${pr.number}`);
      this.logger.log(`PR Title : ${pr.title}`);
      this.logger.log(`PR Author : ${pr.user?.login}`);
      this.logger.log(`PR Head : ${pr.head?.ref}`);
      this.logger.log(`PR Base : ${pr.base?.ref}`);
    }

    this.logger.log(`Delivery : ${delivery}`);

    return {
      success: true,
      repository,
      action,
      event,
      pr: payload.pull_request ? {
        number: payload.pull_request.number,
        title: payload.pull_request.title,
        author: payload.pull_request.user?.login,
        head: payload.pull_request.head?.ref,
        base: payload.pull_request.base?.ref,
        url: payload.pull_request.html_url,
      } : null,
    };
  }
}