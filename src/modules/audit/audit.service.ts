import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export enum AuditAction {
  CREATE_TICKET_REQUEST = 'CREATE_TICKET_REQUEST',
  CREATE_TICKET_SUCCESS = 'CREATE_TICKET_SUCCESS',
  CREATE_TICKET_DUPLICATED = 'CREATE_TICKET_DUPLICATED',
  CREATE_TICKET_FAILED = 'CREATE_TICKET_FAILED',
  JIRA_CREATE_ISSUE_FAILED = 'JIRA_CREATE_ISSUE_FAILED',
  JIRA_UPLOAD_ATTACHMENT_FAILED = 'JIRA_UPLOAD_ATTACHMENT_FAILED',
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(input: {
    action: AuditAction;
    platform?: string;
    channelId?: string;
    messageId?: string;
    jiraIssueKey?: string;
    actor?: string;
    requestPayload?: unknown;
    responsePayload?: unknown;
    errorMessage?: string;
  }): Promise<void> {
    try {
      await this.prisma.jiraTicketAuditLog.create({
        data: {
          action: input.action,
          platform: input.platform,
          channelId: input.channelId,
          messageId: input.messageId,
          jiraIssueKey: input.jiraIssueKey,
          actor: input.actor,
          requestPayload: this.toJson(input.requestPayload),
          responsePayload: this.toJson(input.responsePayload),
          errorMessage: input.errorMessage,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit log ${input.action}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) {
      return undefined;
    }
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
