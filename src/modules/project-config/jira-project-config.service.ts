import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface JiraProjectConfigResult {
  projectKey: string;
  defaultIssueType: string;
  defaultPriority: string;
  defaultAssignee?: string;
  componentMapping: Record<string, string>;
  severityPriorityMapping: Record<string, string>;
}

@Injectable()
export class JiraProjectConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getConfig(params: {
    platform: string;
    workspaceId: string;
    channelId: string;
    projectKey?: string;
  }): Promise<JiraProjectConfigResult> {
    const fallbackProject =
      params.projectKey ??
      this.configService.get<string>('JIRA_DEFAULT_PROJECT', 'APP');

    const config = await this.prisma.jiraProjectConfig.findFirst({
      where: {
        platform: params.platform,
        workspaceId: params.workspaceId,
        active: true,
        jiraProjectKey: fallbackProject,
        OR: [{ channelId: params.channelId }, { channelId: null }],
      },
      orderBy: [{ channelId: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      projectKey: config?.jiraProjectKey ?? fallbackProject,
      defaultIssueType:
        config?.defaultIssueType ??
        this.configService.get<string>('JIRA_DEFAULT_ISSUE_TYPE', 'Bug'),
      defaultPriority:
        config?.defaultPriority ??
        this.configService.get<string>('JIRA_DEFAULT_PRIORITY', 'Medium'),
      defaultAssignee: config?.defaultAssignee ?? undefined,
      componentMapping: this.toRecord(config?.componentMapping),
      severityPriorityMapping: this.toRecord(config?.severityPriorityMapping),
    };
  }

  private toRecord(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, string>;
  }
}
