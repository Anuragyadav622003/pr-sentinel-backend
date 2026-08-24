import {
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from 'src/shared/redis/redis.service';

@Injectable()
export class FreeQuotaService {
  private readonly dailyLimit: number;

  constructor(
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {
    const limit = this.configService.get<string>(
      'FREE_REVIEWS_PER_USER_PER_DAY',
    );

    this.dailyLimit = Number(limit ?? 5);

    if (
      !Number.isFinite(this.dailyLimit) ||
      this.dailyLimit < 1
    ) {
      throw new Error(
        'FREE_REVIEWS_PER_USER_PER_DAY must be a valid positive number',
      );
    }
  }

  async consumeFreeReview(userId: string): Promise<void> {
    const key = this.buildKey(userId);

    const count = await this.redis.incr(key);

    if (count === 1) {
      await this.redis.expire(
        key,
        this.secondsUntilMidnightUTC(),
      );
    }

    if (count > this.dailyLimit) {
      throw new HttpException(
        'Free AI review limit reached for today',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async getRemaining(userId: string): Promise<number> {
    const count = await this.redis.get<number>(
      this.buildKey(userId),
    );

    return Math.max(
      0,
      this.dailyLimit - (count ?? 0),
    );
  }

  private buildKey(userId: string): string {
    const today = new Date().toISOString().slice(0, 10);

    return `ai-review:user:${userId}:${today}`;
  }

  private secondsUntilMidnightUTC(): number {
    const now = new Date();

    const midnight = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
      ),
    );

    return Math.ceil(
      (midnight.getTime() - now.getTime()) / 1000,
    );
  }
}