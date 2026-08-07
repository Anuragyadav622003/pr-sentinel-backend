import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class SignatureService {
  constructor(
    private readonly configService: ConfigService,
  ) {}

  verifySignature(
    signature: string | undefined,
    rawBody: Buffer,
  ): void {
    if (!signature) {
      throw new UnauthorizedException(
        'Missing GitHub signature',
      );
    }

    const secret = this.configService.get<string>(
      'GITHUB_WEBHOOK_SECRET',
    );

    if (!secret) {
      throw new Error(
        'GITHUB_WEBHOOK_SECRET is not configured',
      );
    }

    const expectedSignature =
      'sha256=' +
      crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(
        signatureBuffer,
        expectedBuffer,
      )
    ) {
      throw new UnauthorizedException(
        'Invalid GitHub signature',
      );
    }
  }
}