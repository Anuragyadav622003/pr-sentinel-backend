import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { RedisService } from 'src/shared/redis/redis.service';

interface InstallStatePayload {
  userId: string;
  createdAt: string;
}

const KEY_PREFIX = 'github-install-state:';
const TTL_SECONDS = 10 * 60; // 10 minutes

@Injectable()
export class InstallStateService {
  private readonly logger = new Logger(InstallStateService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Generate a cryptographically random state token, store it in Redis
   * bound to the given userId, and return the token.
   * TTL is 10 minutes — single-use.
   */
  async create(userId: string): Promise<string> {
    const state = randomBytes(32).toString('hex'); // 64 hex chars
    const payload: InstallStatePayload = {
      userId,
      createdAt: new Date().toISOString(),
    };
    await this.redis.set(`${KEY_PREFIX}${state}`, payload, TTL_SECONDS);
    this.logger.log(`Install state created for user ${userId}`);
    return state;
  }

  /**
   * Consume the state token: validate it, retrieve the associated userId,
   * then delete it (single-use).
   *
   * Returns the userId if valid, or null if the state is unknown or expired.
   */
  async consume(state: string): Promise<string | null> {
    const key = `${KEY_PREFIX}${state}`;
    const payload = await this.redis.get<InstallStatePayload>(key);

    if (!payload) {
      this.logger.warn(`Install state not found or expired: ${state.slice(0, 8)}…`);
      return null;
    }

    // Delete immediately — single-use
    await this.redis.del(key);
    this.logger.log(`Install state consumed for user ${payload.userId}`);
    return payload.userId;
  }
}
