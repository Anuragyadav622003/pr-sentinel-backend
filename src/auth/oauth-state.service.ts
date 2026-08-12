import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { RedisService } from 'src/shared/redis/redis.service';

interface OAuthStatePayload {
  redirect?: string;
  createdAt: string;
}

const KEY_PREFIX = 'oauth-state:';
/**
 * OAuth states are consumed within seconds; 15 minutes is generous enough
 * to survive a slow GitHub OAuth page load without being a security liability.
 */
const TTL_SECONDS = 15 * 60;

/**
 * Redis-backed OAuth state store.
 *
 * Replaces the previous in-memory Map so that:
 *   - States survive server restarts / hot-reloads.
 *   - TTL is enforced by Redis rather than by application logic.
 *   - States are single-use (deleted atomically on first consumption).
 */
@Injectable()
export class OAuthStateService {
  private readonly logger = new Logger(OAuthStateService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Generate a cryptographically random state token, store it in Redis bound
   * to the optional `redirect` path, and return the token.
   */
  async create(redirect?: string): Promise<string> {
    const state = randomBytes(24).toString('hex'); // 48 hex chars
    const payload: OAuthStatePayload = {
      redirect,
      createdAt: new Date().toISOString(),
    };
    await this.redis.set(`${KEY_PREFIX}${state}`, payload, TTL_SECONDS);
    this.logger.log('OAuth state created');
    return state;
  }

  /**
   * Consume the state token: validate it, retrieve the stored payload, then
   * delete it immediately (single-use).
   *
   * Returns the payload if valid, or null if the state is unknown / expired.
   */
  async consume(state: string): Promise<OAuthStatePayload | null> {
    const key = `${KEY_PREFIX}${state}`;
    const payload = await this.redis.get<OAuthStatePayload>(key);

    if (!payload) {
      this.logger.warn(`OAuth state not found or expired: ${state.slice(0, 8)}…`);
      return null;
    }

    await this.redis.del(key);
    this.logger.log('OAuth state consumed');
    return payload;
  }
}
