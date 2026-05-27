import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class SlackResponseService {
  private readonly logger = new Logger(SlackResponseService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async postToResponseUrl(responseUrl: string | undefined, text: string) {
    if (!responseUrl) {
      return;
    }
    try {
      await firstValueFrom(
        this.httpService.post(responseUrl, {
          response_type: 'ephemeral',
          text,
        }),
      );
    } catch (error) {
      this.logger.error(
        'Failed to post Slack response_url message',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async postMessage(channel: string | undefined, text: string) {
    if (!channel) {
      return;
    }
    const token = this.configService.get<string>('SLACK_BOT_TOKEN');
    if (!token) {
      return;
    }
    try {
      await firstValueFrom(
        this.httpService.post(
          'https://slack.com/api/chat.postMessage',
          { channel, text },
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );
    } catch (error) {
      this.logger.error(
        'Failed to post Slack chat message',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async getPermalink(
    channelId: string | undefined,
    messageTs: string | undefined,
  ): Promise<string | undefined> {
    const token = this.configService.get<string>('SLACK_BOT_TOKEN');
    if (!token || !channelId || !messageTs) {
      return undefined;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get('https://slack.com/api/chat.getPermalink', {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            channel: channelId,
            message_ts: messageTs,
          },
        }),
      );

      if (response.data?.ok && response.data?.permalink) {
        return response.data.permalink;
      }
      this.logger.warn(
        `Slack chat.getPermalink failed: ${response.data?.error ?? 'unknown error'}`,
      );
      return undefined;
    } catch (error) {
      this.logger.error(
        'Failed to get Slack message permalink',
        error instanceof Error ? error.message : String(error),
      );
      return undefined;
    }
  }

  async getUserEmail(userId: string): Promise<string | undefined> {
    const token = this.configService.get<string>('SLACK_BOT_TOKEN');
    if (!token) {
      return undefined;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get('https://slack.com/api/users.info', {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            user: userId,
          },
        }),
      );

      if (response.data?.ok && response.data?.user?.profile?.email) {
        return response.data.user.profile.email;
      }
      this.logger.warn(
        `Slack users.info failed: ${response.data?.error ?? 'unknown error'}`,
      );
      return undefined;
    } catch (error) {
      this.logger.error(
        'Failed to get Slack user email',
        error instanceof Error ? error.message : String(error),
      );
      return undefined;
    }
  }
}
