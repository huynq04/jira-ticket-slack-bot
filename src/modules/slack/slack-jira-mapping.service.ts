import { Injectable } from '@nestjs/common';
import { SlackJiraProjectMapping } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface JiraAssigneeResolution {
  raw?: string;
  jiraAccountId?: string;
  jiraDisplayName?: string;
}

@Injectable()
export class SlackJiraMappingService {
  constructor(private readonly prisma: PrismaService) {}

  findProjectMapping(params: {
    slackTeamId: string;
    slackChannelId: string;
  }): Promise<SlackJiraProjectMapping | null> {
    return this.prisma.slackJiraProjectMapping.findFirst({
      where: {
        slackTeamId: params.slackTeamId,
        slackChannelId: params.slackChannelId,
        isActive: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async resolveAssignee(
    assignee: string | undefined,
  ): Promise<JiraAssigneeResolution> {
    if (!assignee) {
      return {};
    }

    const slackUserId = this.extractSlackUserId(assignee);
    if (slackUserId) {
      const mapping = await this.prisma.slackJiraUserMapping.findFirst({
        where: { slackUserId, isActive: true },
        orderBy: { updatedAt: 'desc' },
      });

      return {
        raw: assignee,
        jiraAccountId: mapping?.jiraAccountId,
        jiraDisplayName: mapping?.jiraDisplayName ?? undefined,
      };
    }

    const slackUsername = this.normalizeUsername(assignee);
    const mapping = await this.prisma.slackJiraUserMapping.findFirst({
      where: {
        isActive: true,
        OR: [
          { slackUsername: { equals: slackUsername, mode: 'insensitive' } },
          { jiraDisplayName: { equals: assignee, mode: 'insensitive' } },
          { jiraAccountId: assignee },
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      raw: assignee,
      jiraAccountId: mapping?.jiraAccountId,
      jiraDisplayName: mapping?.jiraDisplayName ?? undefined,
    };
  }

  private extractSlackUserId(value: string): string | undefined {
    const match = value.trim().match(/^<@([A-Z0-9]+)(?:\|[^>]+)?>$/i);
    return match?.[1];
  }

  private normalizeUsername(value: string): string {
    return value.trim().replace(/^@/, '');
  }
}
