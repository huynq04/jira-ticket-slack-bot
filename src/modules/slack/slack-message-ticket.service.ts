import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, AuditService } from '../audit/audit.service';
import { DuplicateCheckService } from '../duplicate/duplicate-check.service';
import { JiraAdfUtil } from '../jira/jira-adf.util';
import { JiraAttachmentService } from '../jira/jira-attachment.service';
import { JiraIssueService } from '../jira/jira-issue.service';
import { JiraCreateIssuePayload } from '../mapping/jira-field-mapper.service';
import { PrismaService } from '../prisma/prisma.service';
import { sha256 } from '../../common/utils/hash.util';
import {
  SlackFileFailure,
  SlackFilePayload,
  SlackFileService,
} from './slack-file.service';
import { SlackJiraMappingService } from './slack-jira-mapping.service';
import { SlackMessageParserService } from './slack-message-parser.service';
import { SlackResponseService } from './slack-response.service';

interface SlackMessageShortcutPayload {
  type?: string;
  callback_id?: string;
  team?: {
    id?: string;
  };
  channel?: {
    id?: string;
    name?: string;
  };
  user?: {
    id?: string;
    name?: string;
    username?: string;
  };
  message?: {
    ts?: string;
    thread_ts?: string;
    text?: string;
    permalink?: string;
    reply_count?: number;
    files?: SlackFilePayload[];
  };
}

interface ShortcutContext {
  teamId: string;
  channelId: string;
  channelName?: string;
  messageTs: string;
  threadTs: string;
  userId: string;
  userName?: string;
  text: string;
  files: SlackFilePayload[];
  permalink?: string;
  hasThread: boolean;
}

@Injectable()
export class SlackMessageTicketService {
  private readonly logger = new Logger(SlackMessageTicketService.name);

  constructor(
    private readonly auditService: AuditService,
    private readonly duplicateCheckService: DuplicateCheckService,
    private readonly jiraAdfUtil: JiraAdfUtil,
    private readonly jiraAttachmentService: JiraAttachmentService,
    private readonly jiraIssueService: JiraIssueService,
    private readonly mappingService: SlackJiraMappingService,
    private readonly parserService: SlackMessageParserService,
    private readonly prisma: PrismaService,
    private readonly slackFileService: SlackFileService,
    private readonly slackResponseService: SlackResponseService,
  ) {}

  async createFromMessageShortcut(
    payload: SlackMessageShortcutPayload,
  ): Promise<void> {
    const context = this.toContext(payload);
    if (!context) {
      this.logger.warn('Received incomplete Slack message shortcut payload');
      return;
    }

    try {
      await this.auditService.log({
        action: AuditAction.CREATE_TICKET_REQUEST,
        platform: 'SLACK',
        channelId: context.channelId,
        messageId: context.messageTs,
        actor: context.userId,
        requestPayload: this.auditPayload(context),
      });

      const mapping = await this.mappingService.findProjectMapping({
        slackTeamId: context.teamId,
        slackChannelId: context.channelId,
      });

      if (!mapping) {
        await this.reply(
          context,
          '❌ Không tạo được Jira ticket.\nLý do: Channel này chưa được map với Jira project.',
        );
        await this.auditService.log({
          action: AuditAction.CREATE_TICKET_FAILED,
          platform: 'SLACK',
          channelId: context.channelId,
          messageId: context.messageTs,
          actor: context.userId,
          errorMessage: 'Slack channel is not mapped to a Jira project',
        });
        return;
      }

      const duplicate = await this.duplicateCheckService.findExisting({
        platform: 'SLACK',
        workspaceId: context.teamId,
        channelId: context.channelId,
        messageId: context.messageTs,
      });
      if (duplicate) {
        await this.reply(
          context,
          `✅ Jira ticket đã tồn tại: <${duplicate.jiraIssueUrl}|${duplicate.jiraIssueKey}>`,
        );
        await this.auditService.log({
          action: AuditAction.CREATE_TICKET_DUPLICATED,
          platform: 'SLACK',
          channelId: context.channelId,
          messageId: context.messageTs,
          actor: context.userId,
          jiraIssueKey: duplicate.jiraIssueKey,
          responsePayload: duplicate,
        });
        return;
      }

      const parsed = this.parserService.parse(context.text);
      const assignee = await this.resolveAssignee(parsed.assignee);
      const permalink =
        context.permalink ??
        (await this.slackResponseService.getPermalink(
          context.channelId,
          context.messageTs,
        ));
      const slackFiles = await this.slackFileService.downloadFiles(
        context.files,
      );

      const createPayload = this.buildCreatePayload({
        projectKey: mapping.jiraProjectKey,
        issueType: mapping.defaultIssueType,
        summary: parsed.title,
        description: this.buildDescription({
          messageText: parsed.descriptionText,
        }),
        assignee: {
          accountId: assignee.jiraAccountId,
          name: assignee.jiraUsername,
        },
      });

      const createdIssue =
        await this.jiraIssueService.createIssue(createPayload);
      const issueUrl = this.jiraIssueService.issueBrowseUrl(createdIssue.key);

      const uploadFailures: SlackFileFailure[] = [...slackFiles.failures];
      let uploadedFileCount = 0;
      for (const attachment of slackFiles.attachments) {
        try {
          await this.jiraAttachmentService.uploadAttachment(
            createdIssue.key,
            attachment,
          );
          uploadedFileCount += 1;
        } catch (error) {
          const reason = this.cleanError(error);
          uploadFailures.push({ name: attachment.name, reason });
          await this.auditService.log({
            action: AuditAction.JIRA_UPLOAD_ATTACHMENT_FAILED,
            platform: 'SLACK',
            channelId: context.channelId,
            messageId: context.messageTs,
            jiraIssueKey: createdIssue.key,
            actor: context.userId,
            errorMessage: `${attachment.name}: ${reason}`,
          });
        }
      }

      await this.prisma.jiraTicketMapping.create({
        data: {
          platform: 'SLACK',
          workspaceId: context.teamId,
          channelId: context.channelId,
          messageId: context.messageTs,
          messageUrl: permalink,
          messageHash: sha256(context.text),
          jiraIssueKey: createdIssue.key,
          jiraIssueUrl: issueUrl,
          createdBy: context.userId,
          status: 'CREATED',
        },
      });

      await this.auditService.log({
        action: AuditAction.CREATE_TICKET_SUCCESS,
        platform: 'SLACK',
        channelId: context.channelId,
        messageId: context.messageTs,
        actor: context.userId,
        jiraIssueKey: createdIssue.key,
        requestPayload: createPayload,
        responsePayload: {
          issueKey: createdIssue.key,
          issueUrl,
          uploadedFileCount,
          uploadFailures,
        },
      });

      await this.reply(
        context,
        this.buildSuccessResponse({
          issueKey: createdIssue.key,
          issueUrl,
          title: parsed.title,
          projectKey: mapping.jiraProjectKey,
          assigneeRaw: parsed.assignee,
          assigneeResolved: Boolean(
            assignee.jiraAccountId ?? assignee.jiraUsername,
          ),
          uploadedFileCount,
          uploadFailures,
        }),
      );
    } catch (error) {
      const reason = this.cleanError(error);
      this.logger.error(
        'Failed to create Jira ticket from Slack message shortcut',
        error instanceof Error ? error.stack : String(error),
      );
      await this.auditService.log({
        action: AuditAction.CREATE_TICKET_FAILED,
        platform: 'SLACK',
        channelId: context.channelId,
        messageId: context.messageTs,
        actor: context.userId,
        errorMessage: reason,
      });
      await this.reply(
        context,
        `❌ Không tạo được Jira ticket.\nLý do: ${reason}`,
      );
    }
  }

  private toContext(
    payload: SlackMessageShortcutPayload,
  ): ShortcutContext | undefined {
    const teamId = payload.team?.id;
    const channelId = payload.channel?.id;
    const messageTs = payload.message?.ts;
    const userId = payload.user?.id;
    if (!teamId || !channelId || !messageTs || !userId) {
      return undefined;
    }

    const threadTs = payload.message?.thread_ts ?? messageTs;
    return {
      teamId,
      channelId,
      channelName: payload.channel?.name,
      messageTs,
      threadTs,
      userId,
      userName: payload.user?.name ?? payload.user?.username,
      text: payload.message?.text ?? '',
      files: payload.message?.files ?? [],
      permalink: payload.message?.permalink,
      hasThread:
        Boolean(payload.message?.thread_ts) ||
        Boolean((payload.message?.reply_count ?? 0) > 0),
    };
  }

  private buildCreatePayload(params: {
    projectKey: string;
    issueType: string;
    summary: string;
    description: string;
    assignee?: {
      accountId?: string;
      name?: string;
    };
  }): JiraCreateIssuePayload {
    return {
      fields: {
        project: { key: params.projectKey },
        summary: params.summary,
        description: this.jiraAdfUtil.toDescriptionField(params.description),
        issuetype: { name: params.issueType },
        ...(params.assignee?.accountId
          ? { assignee: { accountId: params.assignee.accountId } }
          : params.assignee?.name
            ? { assignee: { name: params.assignee.name } }
            : {}),
      },
    };
  }

  private async resolveAssignee(rawAssignee: string | undefined): Promise<{
    raw?: string;
    jiraAccountId?: string;
    jiraUsername?: string;
    jiraDisplayName?: string;
  }> {
    const mapping = await this.mappingService.resolveAssignee(rawAssignee);
    if (!rawAssignee || mapping.jiraAccountId) {
      return {
        raw: mapping.raw,
        jiraAccountId: mapping.jiraAccountId,
        jiraDisplayName: mapping.jiraDisplayName,
      };
    }

    const jiraUser = await this.findJiraUserForAssignee(rawAssignee);
    return {
      raw: rawAssignee,
      jiraAccountId: jiraUser?.accountId,
      jiraUsername: jiraUser?.name,
      jiraDisplayName: jiraUser?.displayName,
    };
  }

  private async findJiraUserForAssignee(rawAssignee: string) {
    for (const candidate of await this.assigneeSearchCandidates(rawAssignee)) {
      const jiraUser =
        await this.jiraIssueService.findAssignableUserByQuery(candidate);
      if (jiraUser) {
        return jiraUser;
      }
    }

    return undefined;
  }

  private async assigneeSearchCandidates(
    rawAssignee: string,
  ): Promise<string[]> {
    const candidates = new Set<string>();
    const trimmed = rawAssignee.trim();
    const mention = trimmed.match(/^<@([A-Z0-9]+)(?:\|([^>]+))?>$/i);

    if (mention?.[2]) {
      candidates.add(mention[2]);
    } else if (!mention) {
      candidates.add(trimmed.replace(/^@/, ''));
    }

    if (mention?.[1]) {
      const slackUser = await this.slackResponseService.getUserInfo(mention[1]);
      for (const value of [
        slackUser?.name,
        slackUser?.displayName,
        slackUser?.realName,
        slackUser?.email,
      ]) {
        if (value) {
          candidates.add(value);
        }
      }
    }

    return [...candidates].filter(Boolean);
  }

  private buildDescription(params: { messageText: string }): string {
    return params.messageText || '(empty message)';
  }

  private buildSuccessResponse(params: {
    issueKey: string;
    issueUrl: string;
    title: string;
    projectKey: string;
    assigneeRaw?: string;
    assigneeResolved: boolean;
    uploadedFileCount: number;
    uploadFailures: SlackFileFailure[];
  }): string {
    const lines = [
      `✅ Đã tạo Jira ticket: <${params.issueUrl}|${params.issueKey}>`,
      `Title: ${params.title}`,
      `Project: ${params.projectKey}`,
    ];

    if (params.assigneeRaw) {
      lines.push(
        params.assigneeResolved
          ? `Assignee: ${params.assigneeRaw}`
          : `⚠️ Không tìm thấy Jira account của ${params.assigneeRaw} nên ticket chưa được assign.`,
      );
    }

    lines.push(`Attachments: ${params.uploadedFileCount} file uploaded`);
    if (params.uploadFailures.length) {
      lines.push(
        `⚠️ File lỗi: ${params.uploadFailures
          .map((file) => `${file.name} (${file.reason})`)
          .join(', ')}`,
      );
    }
    lines.push(`Link: ${params.issueUrl}`);

    return lines.join('\n');
  }

  private reply(context: ShortcutContext, text: string): Promise<void> {
    return this.slackResponseService.postMessage(
      context.channelId,
      text,
      context.threadTs,
    );
  }

  private auditPayload(context: ShortcutContext) {
    return {
      teamId: context.teamId,
      channelId: context.channelId,
      channelName: context.channelName,
      messageTs: context.messageTs,
      threadTs: context.threadTs,
      userId: context.userId,
      textLength: context.text.length,
      fileNames: context.files.map(
        (file) => file.name ?? file.title ?? file.id ?? 'file',
      ),
    };
  }

  private cleanError(error: unknown): string {
    if (this.isAxiosError(error)) {
      const responseData = error.response?.data;
      if (responseData && typeof responseData === 'object') {
        const data = responseData as {
          errorMessages?: string[];
          errors?: Record<string, string>;
          error?: string;
        };
        const messages = [
          ...(data.errorMessages ?? []),
          ...Object.entries(data.errors ?? {}).map(
            ([field, message]) => `${field}: ${message}`,
          ),
          ...(data.error ? [data.error] : []),
        ];
        if (messages.length) {
          return messages.join('; ');
        }
      }

      if (typeof responseData === 'string' && responseData.trim()) {
        return responseData.trim();
      }

      if (error.response?.status) {
        return `HTTP ${error.response.status}`;
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
