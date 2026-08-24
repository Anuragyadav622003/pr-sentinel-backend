import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { RedisService } from './shared/redis/redis.service';
import { AuthModule } from './auth/auth.module';
import { GithubModule } from './github/github.module';
import { LlmModule } from './llm/llm.module';
import { PrismaModule } from './prisma/prisma.module';
import { PullRequestModule } from './pull-request/pull-request.module';
import { RepositoryModule } from './repository/repository.module';
import { ReviewsModule } from './reviews/reviews.module';
import { WebhookModule } from './webhook/webhook.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
     BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');

        if (redisUrl) {
          return {
            connection: {
              url: redisUrl,
              family: 4,
            },
          };
        }

        return {
          connection: {
            host:
              configService.get<string>('REDIS_HOST') ?? 'localhost',

            port: Number(
              configService.get<string>('REDIS_PORT') ?? 6379,
            ),

            password:
              configService.get<string>('REDIS_PASSWORD') || undefined,

            family: 4,
          },
        };
      },
    }),

    PrismaModule,
    AuthModule,
    GithubModule,
    RepositoryModule,
    PullRequestModule,
    ReviewsModule,
    LlmModule,
    WebhookModule,
  ],
  controllers: [AppController],
  providers: [RedisService],
})
export class AppModule {}
