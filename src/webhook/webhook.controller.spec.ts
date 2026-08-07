import { Test, TestingModule } from '@nestjs/testing';
import { WebhookController } from './webhook.controller';

describe('WebhookController', () => {
  let controller: WebhookController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
    }).compile();

    controller = module.get<WebhookController>(WebhookController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return webhook info when called', () => {
    const body = { action: 'opened', repository: { full_name: 'owner/repo' } } as any;
    const headers = {
      'x-github-event': 'pull_request',
      'x-github-delivery': 'delivery-id-123',
    } as Record<string, string>;

    const res = controller.githubWebhook(body, headers);

    expect(res).toBeDefined();
    expect(res.message).toBe('Webhook received');
    expect(res.event).toBe('pull_request');
    expect(res.delivery).toBe('delivery-id-123');
    expect(res.repository).toBe('owner/repo');
    expect(res.action).toBe('opened');
  });
});
