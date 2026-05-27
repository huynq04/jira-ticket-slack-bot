import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditAction, AuditService } from '../audit/audit.service';
import { DuplicateCheckService } from '../duplicate/duplicate-check.service';
import { JiraAttachmentService } from '../jira/jira-attachment.service';
import { JiraIssueService } from '../jira/jira-issue.service';
import { JiraFieldMapperService } from '../mapping/jira-field-mapper.service';
import { BugParserService } from '../parser/bug-parser.service';
import { PrismaService } from '../prisma/prisma.service';
import { JiraProjectConfigService } from '../project-config/jira-project-config.service';
import { sha256 } from '../../common/utils/hash.util';
import { CreateTicketRequestDto } from './dto/create-ticket-request.dto';
import { CreateTicketResponseDto } from './dto/create-ticket-response.dto';

@Injectable()
export class TicketService {
  constructor(
    private readonly duplicateCheckService: DuplicateCheckService,
    private readonly parserService: BugParserService,
    private readonly projectConfigService: JiraProjectConfigService,
    private readonly mapperService: JiraFieldMapperService,
    private readonly jiraIssueService: JiraIssueService,
    private readonly jiraAttachmentService: JiraAttachmentService,
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  async createTicketFromMessage(
    request: CreateTicketRequestDto,
  ): Promise<CreateTicketResponseDto> {
    await this.auditService.log({
      action: AuditAction.CREATE_TICKET_REQUEST,
      platform: request.source.platform,
      channelId: request.source.channelId,
      messageId: request.source.messageId,
      actor: request.sender.platformUserId,
      requestPayload: request,
    });

    const duplicate = await this.duplicateCheckService.findExisting(
      request.source,
    );
    if (duplicate) {
      const response = {
        success: true,
        duplicated: true,
        issueKey: duplicate.jiraIssueKey,
        issueUrl: duplicate.jiraIssueUrl,
        summary: duplicate.jiraIssueKey,
      };
      await this.auditService.log({
        action: AuditAction.CREATE_TICKET_DUPLICATED,
        platform: request.source.platform,
        channelId: request.source.channelId,
        messageId: request.source.messageId,
        jiraIssueKey: duplicate.jiraIssueKey,
        actor: request.sender.platformUserId,
        responsePayload: response,
      });
      return response;
    }

    const parsedBug = this.parserService.parse(request.message.content);
    const projectConfig = await this.projectConfigService.getConfig({
      platform: request.source.platform,
      workspaceId: request.source.workspaceId,
      channelId: request.source.channelId,
      projectKey: request.command.projectKey,
    });
    const payload = this.mapperService.mapToCreateIssuePayload({
      parsedBug,
      config: projectConfig,
      sourceUrl: request.source.messageUrl,
      command: {
        issueType: request.command.issueType,
        priority: request.command.priority,
        assignee: request.command.assignee,
      },
    });

    let issueKey: string;
    let issueUrl: string;
    try {
      const createdIssue = await this.jiraIssueService.createIssue(payload);
      issueKey = createdIssue.key;
      issueUrl = this.jiraIssueService.issueBrowseUrl(issueKey);
    } catch (error) {
      await this.auditService.log({
        action: AuditAction.JIRA_CREATE_ISSUE_FAILED,
        platform: request.source.platform,
        channelId: request.source.channelId,
        messageId: request.source.messageId,
        actor: request.sender.platformUserId,
        requestPayload: payload,
        errorMessage: this.cleanError(error),
      });
      await this.auditService.log({
        action: AuditAction.CREATE_TICKET_FAILED,
        platform: request.source.platform,
        channelId: request.source.channelId,
        messageId: request.source.messageId,
        actor: request.sender.platformUserId,
        errorMessage: this.cleanError(error),
      });
      throw new BadRequestException(
        `Failed to create Jira issue: ${this.cleanError(error)}`,
      );
    }

    try {
      await this.jiraAttachmentService.uploadAttachments(
        issueKey,
        request.message.attachments ?? [],
      );
    } catch (error) {
      await this.auditService.log({
        action: AuditAction.JIRA_UPLOAD_ATTACHMENT_FAILED,
        platform: request.source.platform,
        channelId: request.source.channelId,
        messageId: request.source.messageId,
        jiraIssueKey: issueKey,
        actor: request.sender.platformUserId,
        errorMessage: this.cleanError(error),
      });
    }

    await this.prisma.jiraTicketMapping.create({
      data: {
        platform: request.source.platform,
        workspaceId: request.source.workspaceId,
        channelId: request.source.channelId,
        messageId: request.source.messageId,
        messageUrl: request.source.messageUrl,
        messageHash: sha256(request.message.content),
        jiraIssueKey: issueKey,
        jiraIssueUrl: issueUrl,
        createdBy: request.sender.platformUserId,
        status: 'CREATED',
      },
    });

    const response = {
      success: true,
      duplicated: false,
      issueKey,
      issueUrl,
      summary: String(payload.fields.summary),
    };

    await this.auditService.log({
      action: AuditAction.CREATE_TICKET_SUCCESS,
      platform: request.source.platform,
      channelId: request.source.channelId,
      messageId: request.source.messageId,
      jiraIssueKey: issueKey,
      actor: request.sender.platformUserId,
      requestPayload: payload,
      responsePayload: response,
    });

    return response;
  }

  private cleanError(error: unknown): string {
    if (this.isAxiosError(error)) {
      const responseData = error.response?.data;
      if (responseData && typeof responseData === 'object') {
        const data = responseData as {
          errorMessages?: string[];
          errors?: Record<string, string>;
        };
        const messages = [
          ...(data.errorMessages ?? []),
          ...Object.entries(data.errors ?? {}).map(
            ([field, message]) => `${field}: ${message}`,
          ),
        ];
        if (messages.length) {
          return messages.join('; ');
        }
      }

      if (typeof responseData === 'string' && responseData.trim()) {
        return responseData.trim();
      }

      if (error.response?.status) {
        return `Jira responded with HTTP ${error.response.status}`;
      }
    }

    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private isAxiosError(error: unknown): error is {
    response?: {
      status?: number;
      data?: unknown;
    };
  } {
    return typeof error === 'object' && error !== null && 'response' in error;
  }
}
