import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface SlackThreadMessage {
  ts?: string;
  user?: string;
  username?: string;
  text?: string;
  botId?: string;
  subtype?: string;
}

export interface SlackUserInfo {
  id?: string;
  name?: string;
  realName?: string;
  displayName?: string;
  email?: string;
}

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

  async postMessage(
    channel: string | undefined,
    text: string,
    threadTs?: string,
  ) {
    if (!channel) {
      return;
    }
    const token = this.configService.get<string>('SLACK_BOT_TOKEN');
    if (!token) {
      return;
    }
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          'https://slack.com/api/chat.postMessage',
          {
            channel,
            text,
            ...(threadTs ? { thread_ts: threadTs } : {}),
          },
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );
      if (!response.data?.ok) {
        this.logger.warn(
          `Slack chat.postMessage failed: ${response.data?.error ?? 'unknown error'}`,
        );
      }
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
      this.logger.warn(
        'Optional Slack chat.getPermalink lookup failed',
        error instanceof Error ? error.message : String(error),
      );
      return undefined;
    }
  }

  async getThreadReplies(
    channelId: string | undefined,
    threadTs: string | undefined,
  ): Promise<SlackThreadMessage[]> {
    const token = this.configService.get<string>('SLACK_BOT_TOKEN');
    if (!token || !channelId || !threadTs) {
      return [];
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get('https://slack.com/api/conversations.replies', {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            channel: channelId,
            ts: threadTs,
            limit: 20,
          },
        }),
      );

      if (response.data?.ok && Array.isArray(response.data?.messages)) {
        return response.data.messages.map((message: any) => ({
          ts: message.ts,
          user: message.user,
          username: message.username,
          text: message.text,
          botId: message.bot_id,
          subtype: message.subtype,
        }));
      }
      this.logger.warn(
        `Slack conversations.replies failed: ${response.data?.error ?? 'unknown error'}`,
      );
      return [];
    } catch (error) {
      this.logger.warn(
        'Optional Slack conversations.replies lookup failed',
        error instanceof Error ? error.message : String(error),
      );
      return [];
    }
  }

  async getUserEmail(userId: string): Promise<string | undefined> {
    return (await this.getUserInfo(userId))?.email;
  }

  async getUserInfo(userId: string): Promise<SlackUserInfo | undefined> {
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

      if (response.data?.ok && response.data?.user) {
        const user = response.data.user;
        return {
          id: user.id,
          name: user.name,
          realName: user.real_name,
          displayName: user.profile?.display_name,
          email: user.profile?.email,
        };
      }
      this.logger.warn(
        `Slack users.info failed: ${response.data?.error ?? 'unknown error'}`,
      );
      return undefined;
    } catch (error) {
      this.logger.warn(
        'Optional Slack users.info lookup failed',
        error instanceof Error ? error.message : String(error),
      );
      return undefined;
    }
  }
}
