import { Injectable, Logger } from '@nestjs/common';
import { JiraIssueService } from '../jira/jira-issue.service';
import { CreateTicketRequestDto } from '../ticket/dto/create-ticket-request.dto';
import { TicketService } from '../ticket/ticket.service';
import { SlackResponseService } from './slack-response.service';

interface ParsedCommand {
  projectKey?: string;
  issueType?: string;
  priority?: string;
  assignee?: string;
  content: string;
}

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);

  constructor(
    private readonly ticketService: TicketService,
    private readonly slackResponseService: SlackResponseService,
    private readonly jiraIssueService: JiraIssueService,
  ) {}

  async handleSlashCommand(body: Record<string, string>) {
    const parsed = this.parseCommandText(body.text ?? '');
    if (!parsed.content.trim()) {
      return {
        response_type: 'ephemeral',
        text: 'Please include the bug content after command options.',
      };
    }

    const request: CreateTicketRequestDto = {
      source: {
        platform: 'SLACK',
        workspaceId: body.team_id,
        channelId: body.channel_id,
        messageId: body.trigger_id ?? `${Date.now()}`,
      },
      sender: {
        platformUserId: body.user_id,
        displayName: body.user_name,
      },
      command: {
        rawText: `/create-ticket-jira ${body.text ?? ''}`.trim(),
        projectKey: parsed.projectKey,
        issueType: parsed.issueType,
        priority: parsed.priority,
        assignee: parsed.assignee,
      },
      message: {
        content: parsed.content,
        attachments: [],
      },
    };

    void this.createAndRespond(request, body.response_url);
    return {
      response_type: 'ephemeral',
      text: 'Creating Jira ticket...',
    };
  }

  async handleInteraction(payloadString?: string) {
    if (!payloadString) {
      return { response_type: 'ephemeral', text: 'Missing Slack payload.' };
    }

    const payload = JSON.parse(payloadString);
    if (payload.callback_id !== 'create_jira_ticket') {
      return { response_type: 'ephemeral', text: 'Unsupported action.' };
    }

    const message = payload.message ?? {};
    const channel = payload.channel ?? {};
    const user = payload.user ?? {};
    const permalink =
      message.permalink ??
      (await this.slackResponseService.getPermalink(channel.id, message.ts));

    const request: CreateTicketRequestDto = {
      source: {
        platform: 'SLACK',
        workspaceId: payload.team?.id,
        channelId: channel.id,
        messageId: message.ts,
        messageUrl: permalink,
      },
      sender: {
        platformUserId: user.id,
        displayName: user.name,
      },
      command: {
        rawText: 'Create Jira Ticket',
      },
      message: {
        content: message.text ?? '',
        attachments: [],
      },
    };

    void this.createAndRespond(request, payload.response_url, channel.id);
    return {
      response_type: 'ephemeral',
      text: 'Creating Jira ticket...',
    };
  }

  private async createAndRespond(
    request: CreateTicketRequestDto,
    responseUrl?: string,
    channelId?: string,
  ): Promise<void> {
    try {
      request.command.assignee = await this.resolveSlackAssignee(
        request.command.assignee,
      );
      const result = await this.ticketService.createTicketFromMessage(request);
      const duplicateText = result.duplicated
        ? 'Existing Jira ticket'
        : 'Created Jira ticket';
      const text = `${duplicateText}: <${result.issueUrl}|${result.issueKey}> - ${result.summary}`;
      if (responseUrl) {
        await this.slackResponseService.postToResponseUrl(responseUrl, text);
      } else {
        await this.slackResponseService.postMessage(channelId, text);
      }
    } catch (error) {
      this.logger.error(
        'Failed to create Jira ticket from Slack request',
        error instanceof Error ? error.stack : String(error),
      );
      await this.slackResponseService.postToResponseUrl(
        responseUrl,
        'Failed to create Jira ticket. Please contact the service owner.',
      );
    }
  }

  private async resolveSlackAssignee(
    assignee: string | undefined,
  ): Promise<string | undefined> {
    if (!assignee) {
      return undefined;
    }

    const slackUserId = this.extractSlackUserId(assignee);
    if (!slackUserId) {
      return this.normalizePlainAssignee(assignee);
    }

    const email = await this.slackResponseService.getUserEmail(slackUserId);
    if (!email) {
      return assignee;
    }

    const jiraUsername = await this.jiraIssueService.findUsernameByEmail(email);
    return jiraUsername ?? email.split('@')[0];
  }

  private normalizePlainAssignee(assignee: string): string {
    return assignee.startsWith('@') ? assignee.slice(1) : assignee;
  }

  private extractSlackUserId(value: string): string | undefined {
    const match = value.match(/^<@([A-Z0-9]+)(?:\|[^>]+)?>$/i);
    return match?.[1];
  }

  private parseCommandText(text: string): ParsedCommand {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const firstLine = lines.shift() ?? '';
    const options: Omit<ParsedCommand, 'content'> = {};
    const contentParts: string[] = [];

    for (const token of firstLine.split(/\s+/).filter(Boolean)) {
      const [key, ...valueParts] = token.split('=');
      const value = valueParts.join('=');
      if (!value) {
        contentParts.push(token);
        continue;
      }

      if (key === 'project') {
        options.projectKey = value;
      } else if (key === 'issueType' || key === 'type') {
        options.issueType = value;
      } else if (key === 'priority') {
        options.priority = value;
      } else if (key === 'assignee') {
        options.assignee = value;
      } else {
        contentParts.push(token);
      }
    }

    contentParts.push(...lines);
    return {
      ...options,
      content: contentParts.join('\n').trim(),
    };
  }
}
