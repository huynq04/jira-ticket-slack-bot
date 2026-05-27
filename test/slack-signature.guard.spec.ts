import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { SlackSignatureGuard } from '../src/modules/slack/slack-signature.guard';

describe('SlackSignatureGuard', () => {
  const secret = 'slack-secret';

  function context(rawBody: string, timestamp: string, signature: string) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          rawBody,
          headers: {
            'x-slack-request-timestamp': timestamp,
            'x-slack-signature': signature,
          },
        }),
      }),
    } as any;
  }

  it('accepts a valid Slack signature', () => {
    const timestamp = `${Math.floor(Date.now() / 1000)}`;
    const rawBody = 'token=abc&text=hello';
    const signature = `v0=${createHmac('sha256', secret)
      .update(`v0:${timestamp}:${rawBody}`)
      .digest('hex')}`;
    const guard = new SlackSignatureGuard(
      new ConfigService({ SLACK_SIGNING_SECRET: secret }),
    );

    expect(guard.canActivate(context(rawBody, timestamp, signature))).toBe(
      true,
    );
  });

  it('rejects an invalid Slack signature', () => {
    const timestamp = `${Math.floor(Date.now() / 1000)}`;
    const guard = new SlackSignatureGuard(
      new ConfigService({ SLACK_SIGNING_SECRET: secret }),
    );

    expect(() =>
      guard.canActivate(context('text=hello', timestamp, 'v0=bad')),
    ).toThrow('Invalid Slack signature');
  });
});
