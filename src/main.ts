import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';
import https from 'https';
https.globalAgent.options.family = 4; // ← force IPv4 for all outbound HTTPS calls
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // capture raw request body for webhook signature verification
  app.use(
    express.json({
      verify: (req: any, _res: any, buf: Buffer) => {
        req.rawBody = buf;
      },
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
