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
import { SlackAiTicketParserService } from './slack-ai-ticket-parser.service';
import { SlackJiraMappingService } from './slack-jira-mapping.service';
import {
  SlackResponseService,
  SlackThreadMessage,
} from './slack-response.service';

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
    user?: string;
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
  messageUserId?: string;
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
    private readonly aiParserService: SlackAiTicketParserService,
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

      const threadMessages = await this.getTesterThreadMessages(context);
      const parsed = await this.aiParserService.parse(
        context.text,
        threadMessages,
      );
      const assignee = await this.resolveAssignee(parsed.assignee);
      const reporter = await this.resolveReporter(context);
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
        reporter: {
          accountId: reporter.jiraAccountId,
          name: reporter.jiraUsername,
        },
      });

      const createResult = await this.createIssueWithReporterFallback(
        createPayload,
      );
      const createdIssue = createResult.issue;
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
          reporterRaw: reporter.raw,
          reporterResolved: Boolean(
            reporter.jiraAccountId ?? reporter.jiraUsername,
          ),
          reporterSetFailed: createResult.reporterSetFailed,
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
      messageUserId: payload.message?.user,
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
    reporter?: {
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
        ...(params.reporter?.accountId
          ? { reporter: { accountId: params.reporter.accountId } }
          : params.reporter?.name
            ? { reporter: { name: params.reporter.name } }
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

  private async resolveReporter(context: ShortcutContext): Promise<{
    raw?: string;
    jiraAccountId?: string;
    jiraUsername?: string;
    jiraDisplayName?: string;
  }> {
    const slackUserId = context.messageUserId ?? context.userId;
    const rawReporter = `<@${slackUserId}>`;
    const mapping = await this.mappingService.resolveAssignee(rawReporter);
    if (mapping.jiraAccountId) {
      return {
        raw: rawReporter,
        jiraAccountId: mapping.jiraAccountId,
        jiraDisplayName: mapping.jiraDisplayName,
      };
    }

    const jiraUser = await this.findJiraUserForAssignee(rawReporter);
    return {
      raw: rawReporter,
      jiraAccountId: jiraUser?.accountId,
      jiraUsername: jiraUser?.name,
      jiraDisplayName: jiraUser?.displayName,
    };
  }

  private async createIssueWithReporterFallback(
    createPayload: JiraCreateIssuePayload,
  ): Promise<{
    issue: Awaited<ReturnType<JiraIssueService['createIssue']>>;
    reporterSetFailed: boolean;
  }> {
    try {
      return {
        issue: await this.jiraIssueService.createIssue(createPayload),
        reporterSetFailed: false,
      };
    } catch (error) {
      if (!this.hasReporterField(createPayload) || !this.isReporterError(error)) {
        throw error;
      }

      const fallbackPayload = this.withoutReporter(createPayload);
      this.logger.warn(
        `Jira reporter field failed, retrying without reporter: ${this.cleanError(
          error,
        )}`,
      );
      return {
        issue: await this.jiraIssueService.createIssue(fallbackPayload),
        reporterSetFailed: true,
      };
    }
  }

  private hasReporterField(payload: JiraCreateIssuePayload): boolean {
    return Object.prototype.hasOwnProperty.call(payload.fields, 'reporter');
  }

  private withoutReporter(
    payload: JiraCreateIssuePayload,
  ): JiraCreateIssuePayload {
    const { reporter, ...fields } = payload.fields;
    void reporter;
    return { fields };
  }

  private isReporterError(error: unknown): boolean {
    const reason = this.cleanError(error).toLowerCase();
    return (
      reason.includes('reporter') ||
      reason.includes('field') ||
      reason.includes('cannot be set') ||
      reason.includes('unknown fields')
    );
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

  private async getTesterThreadMessages(
    context: ShortcutContext,
  ): Promise<string[]> {
    if (!context.hasThread) {
      return [];
    }

    const replies = await this.slackResponseService.getThreadReplies(
      context.channelId,
      context.threadTs,
    );

    return replies
      .filter((reply) => reply.ts !== context.messageTs)
      .filter((reply) => !this.isBotThreadMessage(reply))
      .map((reply) => reply.text?.trim() ?? '')
      .filter(Boolean);
  }

  private isBotThreadMessage(reply: SlackThreadMessage): boolean {
    return Boolean(reply.botId) || reply.subtype === 'bot_message';
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
    reporterRaw?: string;
    reporterResolved: boolean;
    reporterSetFailed: boolean;
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
    if (params.reporterRaw) {
      lines.push(
        params.reporterSetFailed
          ? `⚠️ Jira không cho set reporter ${params.reporterRaw}, nên reporter vẫn là user mặc định của bot.`
          : params.reporterResolved
          ? `Reporter: ${params.reporterRaw}`
          : `⚠️ Không tìm thấy Jira account của ${params.reporterRaw} nên reporter vẫn là user mặc định của bot.`,
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
          error?: string | { message?: string; code?: string | number };
          metadata?: { raw?: string };
        };
        const errorMessage =
          typeof data.error === 'string' ? data.error : data.error?.message;
        const rawProviderMessage =
          typeof data.error === 'object' && data.error !== null
            ? (data.error as { metadata?: { raw?: string } }).metadata?.raw
            : data.metadata?.raw;
        const messages = [
          ...(data.errorMessages ?? []),
          ...Object.entries(data.errors ?? {}).map(
            ([field, message]) => `${field}: ${message}`,
          ),
          ...(errorMessage ? [errorMessage] : []),
          ...(rawProviderMessage ? [rawProviderMessage] : []),
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
