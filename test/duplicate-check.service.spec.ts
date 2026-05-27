import { DuplicateCheckService } from '../src/modules/duplicate/duplicate-check.service';

describe('DuplicateCheckService', () => {
  it('finds duplicate Slack message mapping', async () => {
    const prisma = {
      jiraTicketMapping: {
        findUnique: jest.fn().mockResolvedValue({ jiraIssueKey: 'APP-1245' }),
      },
    };
    const service = new DuplicateCheckService(prisma as any);

    const result = await service.findExisting({
      platform: 'SLACK',
      workspaceId: 'T123',
      channelId: 'C123',
      messageId: '1710000000.123456',
    });

    expect(result?.jiraIssueKey).toBe('APP-1245');
    expect(prisma.jiraTicketMapping.findUnique).toHaveBeenCalledWith({
      where: {
        platform_workspaceId_channelId_messageId: {
          platform: 'SLACK',
          workspaceId: 'T123',
          channelId: 'C123',
          messageId: '1710000000.123456',
        },
      },
    });
  });
});
