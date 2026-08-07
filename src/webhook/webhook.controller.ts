import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';

@Controller('webhook')
export class WebhookController {
  @Post('github')
  @HttpCode(200)
  githubWebhook(
    @Body() body: any,
    @Headers() headers: Record<string, string>,
  ) {
    console.log('=========== GITHUB WEBHOOK ===========');
    console.log('Event:', headers['x-github-event']);
    console.log('Delivery:', headers['x-github-delivery']);
    console.log('Action:', body.action);
    console.log('Repository:', body.repository?.full_name);

    return {
      message: 'Webhook received',
    };
  }
}