import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as express from 'express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser') as (options?: object) => any;
import https from 'https';
import { ResponseFormatInterceptor } from './shared/interceptor/response-format.interceptor';
import { AllExceptionsFilter } from './shared/filters/all-exceptions.filter';

https.globalAgent.options.family = 4;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalInterceptors(new ResponseFormatInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3001',
    credentials: true,
  });

  // Parse cookies so req.cookies is populated (needed for JWT extraction & clearCookie)
  app.use(cookieParser());

  // Validate and transform incoming DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,       // strip unknown fields
      forbidNonWhitelisted: false,
      transform: true,       // auto-transform payloads to DTO instances
    }),
  );

  app.use(
    express.json({
      verify: (req: express.Request & { rawBody?: Buffer }, _res, buf: Buffer) => {
        req.rawBody = buf;
      },
    }),
  );
 
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
