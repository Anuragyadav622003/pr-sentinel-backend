import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { WebhookService } from './webhook.service';
import { SignatureService } from './signature.service';
import { RawWebhookHeaders } from './types/github-webhook.types';

@Controller('webhook')
export class WebhookController {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly signatureService: SignatureService,
  ) {}

  @Post('github')
  @HttpCode(200)
  async githubWebhook(
    @Req() req: Request & { rawBody: Buffer },
    @Body() payload: any,
    @Headers() headers: RawWebhookHeaders,
  ) {
    this.signatureService.verifySignature(
      headers['x-hub-signature-256'],
      req.rawBody,
    );

    return this.webhookService.handleGithubWebhook(
      payload,
      headers,
    );
  }
}