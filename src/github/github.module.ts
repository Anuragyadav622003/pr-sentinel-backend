import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { RedisService } from 'src/shared/redis/redis.service';
import { GithubController } from './github.controller';
import { GithubService } from './github.service';
import { InstallStateService } from './install-state.service';
import { RepositoryService } from 'src/repository/repository.service';

@Module({
  imports: [
    ConfigModule,   // for ConfigService used by RedisService + controller
    AuthModule,     // exports JwtModule so JwtAuthGuard / JwtStrategy work
    PrismaModule,   // exports PrismaService used by RepositoryService
  ],
  controllers: [GithubController],
  providers: [
    GithubService,
    InstallStateService,
    RedisService,
    RepositoryService,
  ],
  exports: [GithubService, RedisService, RepositoryService],
})
export class GithubModule {}
