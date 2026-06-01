import { Injectable, Logger } from '@nestjs/common';
import { SlackMessageTicketService } from './slack-message-ticket.service';

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);

  constructor(
    private readonly slackMessageTicketService: SlackMessageTicketService,
  ) {}

  async handleInteraction(payloadString?: string) {
    if (!payloadString) {
      return { ok: true };
    }

    let payload: any;
    try {
      payload = JSON.parse(payloadString);
    } catch (error) {
      this.logger.warn(
        `Invalid Slack interaction payload: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { ok: true };
    }

    if (!payload || typeof payload !== 'object') {
      return { ok: true };
    }

    if (
      payload.type !== 'message_action' ||
      payload.callback_id !== 'create_jira_ticket_from_message'
    ) {
      return { ok: true };
    }

    void this.slackMessageTicketService.createFromMessageShortcut(payload);
    return {
      response_type: 'ephemeral',
      text: 'Đang tạo Jira ticket...',
    };
  }
}
