import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './shared/redis/redis.service';

@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  root() {
    return {
      service: 'pr-sentinel-api',
      api: '/api',
      health: '/health',
    };
  }

  @Get('health')
  async health(@Res() res: Response) {
    const checks = {
      database: 'error' as 'ok' | 'error',
      redis: 'error' as 'ok' | 'error',
    };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    try {
      const pong = await this.redis.ping();
      checks.redis = pong === 'PONG' ? 'ok' : 'error';
    } catch {
      checks.redis = 'error';
    }

    const healthy = checks.database === 'ok' && checks.redis === 'ok';

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'error',
      checks,
    });
  }
}
