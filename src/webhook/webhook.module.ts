import { Module } from '@nestjs/common';
import { PullRequestModule } from 'src/pull-request/pull-request.module';
import { RepositoryModule } from 'src/repository/repository.module';
import { GithubService } from '../github/github.service';
import { SignatureService } from './signature.service';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  imports: [
    RepositoryModule, // exports RepositoryService
    PullRequestModule, // exports PullRequestService
  ],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    SignatureService,
    GithubService,
  ],
  exports: [],
})
export class WebhookModule {}
