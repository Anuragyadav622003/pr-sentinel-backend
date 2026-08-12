import { Test, TestingModule } from '@nestjs/testing';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { SignatureService } from './signature.service';
import type { RawWebhookHeaders } from './types/github-webhook.types';

describe('WebhookController', () => {
  let controller: WebhookController;
  let signatureService: SignatureService;
  let webhookService: WebhookService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        {
          provide: WebhookService,
          useValue: {
            handleGithubWebhook: jest.fn().mockResolvedValue({ success: true }),
          },
        },
        {
          provide: SignatureService,
          useValue: { verifySignature: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<WebhookController>(WebhookController);
    signatureService = module.get(SignatureService);
    webhookService = module.get(WebhookService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should verify signature and delegate to WebhookService', async () => {
    const body = {
      action: 'opened',
      repository: { full_name: 'owner/repo' },
    } as any;

    // Use the correct RawWebhookHeaders type so TypeScript is satisfied.
    const headers: RawWebhookHeaders = {
      'x-github-event': 'pull_request',
      'x-github-delivery': 'delivery-id-123',
      'x-hub-signature-256': 'sha256=abc',
    };

    const res = await controller.githubWebhook(
      { rawBody: Buffer.from(JSON.stringify(body)) } as any,
      body,
      headers,
    );

    expect(signatureService.verifySignature).toHaveBeenCalledWith(
      headers['x-hub-signature-256'],
      expect.any(Buffer),
    );
    expect(webhookService.handleGithubWebhook).toHaveBeenCalledWith(
      body,
      headers,
    );
    expect(res).toEqual({ success: true });
  });
});
