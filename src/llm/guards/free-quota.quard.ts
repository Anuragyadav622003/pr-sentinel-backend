import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { FreeQuotaService } from '../services/free-quota.service';
import { LlmMode } from 'src/generated/prisma/enums';

@Injectable()
export class FreeQuotaGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly freeQuota: FreeQuotaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId = req.user?.id;

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.llmMode === LlmMode.BYOK) return true;

    const remaining = await this.freeQuota.getRemaining(userId);
    if (remaining <= 0) {
      throw new HttpException('Free AI review limit reached for today',HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }
}