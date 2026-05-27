import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class InternalApiTokenGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const expected = this.configService.get<string>('INTERNAL_API_TOKEN');
    const auth = req.headers.authorization;

    if (!expected || !auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing internal API token');
    }

    const actual = auth.slice('Bearer '.length);
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);

    if (
      expectedBuffer.length !== actualBuffer.length ||
      !timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      throw new UnauthorizedException('Invalid internal API token');
    }

    return true;
  }
}
