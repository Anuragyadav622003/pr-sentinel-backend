import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import https from 'https';
import { ResponseFormatInterceptor } from './shared/interceptor/response-format.interceptor';
import { AllExceptionsFilter } from './shared/filters/all-exceptions.filter';

https.globalAgent.options.family = 4;

async function bootstrap() {
  // ── Disable NestJS's built-in body parser so we can register our own
  //    express.json() with a `verify` callback that captures the raw body
  //    buffer.  This MUST happen before any middleware or route handler that
  //    reads the body — in particular the webhook HMAC check reads req.rawBody.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // ── Raw-body capture — must be registered before any body-consuming
  //    middleware.  The verify callback runs synchronously while the body is
  //    being read and attaches the raw Buffer to the request object.
  app.use(
    express.json({
      verify: (
        req: express.Request & { rawBody?: Buffer },
        _res: express.Response,
        buf: Buffer,
      ) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));

  // ── Cookie parser (needed for HttpOnly JWT extraction by JwtStrategy)
  app.use(cookieParser());

  // ── Global prefix — all API routes live under /api except the webhook
  //    receiver which GitHub calls directly at /webhook/github.
  app.setGlobalPrefix('api', { exclude: ['webhook/github'] });
 
  // ── CORS — allow the frontend origin to send credentialed requests so the
  //    browser includes the accessToken cookie on every API call.
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3001',
    credentials: true,
  });

  // ── Global interceptor wraps every 2xx response in the standard envelope
  app.useGlobalInterceptors(new ResponseFormatInterceptor());

  // ── Global exception filter converts any thrown exception to the standard
  //    error envelope and logs appropriately.
  app.useGlobalFilters(new AllExceptionsFilter());

  // ── Global validation pipe — strips unknown fields, transforms payloads
  //    into DTO instances, and collects class-validator errors.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
