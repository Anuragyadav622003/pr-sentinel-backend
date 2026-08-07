import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { SignatureService } from './signature.service';
import { GithubService } from '../github/github.service';

@Module({
  controllers: [WebhookController],
  providers: [WebhookService, SignatureService, GithubService],
})
export class WebhookModule {}
