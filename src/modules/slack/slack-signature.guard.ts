import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

@Injectable()
export class SlackSignatureGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const signature = request.headers['x-slack-signature'];
    const timestamp = request.headers['x-slack-request-timestamp'];
    const rawBody = request.rawBody;
    const signingSecret = this.configService.get<string>(
      'SLACK_SIGNING_SECRET',
    );

    if (!signature || !timestamp || !rawBody || !signingSecret) {
      throw new UnauthorizedException('Invalid Slack signature');
    }

    const timestampNumber = Number(timestamp);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!timestampNumber || Math.abs(nowSeconds - timestampNumber) > 60 * 5) {
      throw new UnauthorizedException('Slack request timestamp expired');
    }

    const baseString = `v0:${timestamp}:${rawBody}`;
    const expected = `v0=${createHmac('sha256', signingSecret)
      .update(baseString)
      .digest('hex')}`;

    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(String(signature));
    if (
      expectedBuffer.length !== actualBuffer.length ||
      !timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      throw new UnauthorizedException('Invalid Slack signature');
    }

    return true;
  }
}
