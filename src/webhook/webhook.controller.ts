import { Body, Controller, Headers, HttpCode, Post, Logger } from '@nestjs/common';

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  @Post('github')
  @HttpCode(200)
  githubWebhook(
    @Body() body: any,
    @Headers() headers: Record<string, string>,
  ) {
    this.logger.log('=========== GITHUB WEBHOOK ===========');
    const event = headers['x-github-event'];
    const delivery = headers['x-github-delivery'];
    const action = body?.action;
    const repository = body?.repository?.full_name;

    this.logger.log(`Event: ${event}`);
    this.logger.log(`Delivery: ${delivery}`);
    if (action) this.logger.log(`Action: ${action}`);
    if (repository) this.logger.log(`Repository: ${repository}`);

    if (!event) {
      this.logger.warn('Missing x-github-event header');
    }

    return {
      message: 'Webhook received',
      event: event || null,
      delivery: delivery || null,
      repository: repository || null,
      action: action || null,
    };
  }
}