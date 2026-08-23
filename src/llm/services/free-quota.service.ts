import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from 'src/shared/redis/redis.service'; // adjust to your real path

@Injectable()
export class FreeQuotaService {
  private readonly dailyLimit = Number(
    process.env.FREE_REVIEWS_PER_USER_PER_DAY ?? 5,
  );

  constructor(private readonly redis: RedisService) {}

  async consumeFreeReview(userId: string): Promise<void> {
    const key = this.buildKey(userId);

    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, this.secondsUntilMidnightUTC());
    }
    if (count > this.dailyLimit) {
      throw new HttpException('Free AI review limit reached for today',HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async getRemaining(userId: string): Promise<number> {
    const count = await this.redis.get<number>(this.buildKey(userId));
    return Math.max(0, this.dailyLimit - (count ?? 0));
  }

  private buildKey(userId: string): string {
    const today = new Date().toISOString().slice(0, 10);
    return `ai-review:user:${userId}:${today}`;
  }

  private secondsUntilMidnightUTC(): number {
    const now = new Date();
    const midnight = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );
    return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
  }
}