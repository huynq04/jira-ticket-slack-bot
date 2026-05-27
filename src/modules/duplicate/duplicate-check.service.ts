import { Injectable } from '@nestjs/common';
import { JiraTicketMapping } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DuplicateCheckService {
  constructor(private readonly prisma: PrismaService) {}

  async findExisting(source: {
    platform: string;
    workspaceId: string;
    channelId: string;
    messageId: string;
  }): Promise<JiraTicketMapping | null> {
    const { platform, workspaceId, channelId, messageId } = source;

    return this.prisma.jiraTicketMapping.findUnique({
      where: {
        platform_workspaceId_channelId_messageId: {
          platform,
          workspaceId,
          channelId,
          messageId,
        },
      },
    });
  }
}
