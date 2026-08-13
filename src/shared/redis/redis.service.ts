import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.client = this.createClient();

    this.client.on('error', (err) => {
      this.logger.error(`Redis error: ${err.message}`);
    });

    this.client.connect().catch((err) => {
      this.logger.error(`Redis connect failed: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  /** Store a JSON value with a TTL (seconds). */
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  /** Retrieve and JSON-parse a value. Returns null if missing/expired. */
  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  }

  /** Delete a key. */
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /** Ping Redis for health checks. */
  async ping(): Promise<string> {
    return this.client.ping();
  }

  /**
   * Prefer REDIS_URL (Render injects this when Key Value is linked to the
   * web service). Fall back to REDIS_HOST/REDIS_PORT for local Docker dev.
   */
  private createClient(): Redis {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    const commonOptions = {
      lazyConnect: true,
      // Render private-network DNS resolves over IPv4.
      family: 4 as const,
      retryStrategy: (times: number) => Math.min(times * 200, 2000),
    };

    if (redisUrl) {
      this.logger.log('Connecting to Redis via REDIS_URL');
      return new Redis(redisUrl, commonOptions);
    }

    const host = this.configService.get<string>('REDIS_HOST') ?? 'localhost';
    const port = Number(this.configService.get<string>('REDIS_PORT') ?? 6379);
    const password = this.configService.get<string>('REDIS_PASSWORD');

    this.logger.log(`Connecting to Redis at ${host}:${port}`);
    return new Redis({
      ...commonOptions,
      host,
      port,
      ...(password ? { password } : {}),
    });
  }
}
