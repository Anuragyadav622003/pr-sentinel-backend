import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { PullRequestController } from './pull-request.controller';
import { PullRequestService } from './pull-request.service';

@Module({
  imports: [
    AuthModule, // exports JwtModule so JwtAuthGuard works
  ],
  controllers: [PullRequestController],
  providers: [PullRequestService],
  exports: [PullRequestService],
})
export class PullRequestModule {}
