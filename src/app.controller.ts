import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  root() {
    return {
      status: 'ok',
      service: 'pr-sentinel-api',
      api: '/api',
    };
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
