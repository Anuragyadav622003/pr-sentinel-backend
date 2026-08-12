import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { PullRequestService } from 'src/pull-request/pull-request.service';
import { RepositoryController } from './repository.controller';
import { RepositoryService } from './repository.service';

@Module({
  imports: [
    AuthModule, // exports JwtModule so JwtAuthGuard works
  ],
  controllers: [RepositoryController],
  providers: [RepositoryService, PullRequestService],
  exports: [RepositoryService],
})
export class RepositoryModule {}
