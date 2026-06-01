import { JiraIssueService } from '../src/modules/jira/jira-issue.service';

describe('JiraIssueService', () => {
  it('finds an assignable Jira Server user by username', async () => {
    const jiraClient = {
      searchUsers: jest.fn().mockResolvedValue([
        {
          name: 'huy.nq2',
          key: 'huy.nq2',
          displayName: 'Huy Nguyen',
          active: true,
        },
      ]),
    };
    const service = new JiraIssueService(jiraClient as any);

    await expect(
      service.findAssignableUserByQuery('@huy.nq2'),
    ).resolves.toEqual({
      name: 'huy.nq2',
      displayName: 'Huy Nguyen',
    });

    expect(jiraClient.searchUsers).toHaveBeenCalledWith('huy.nq2');
  });

  it('finds an assignable Jira Cloud user by account id', async () => {
    const jiraClient = {
      searchUsers: jest.fn().mockResolvedValue([
        {
          accountId: 'account-1',
          displayName: 'Huy Nguyen',
          active: true,
        },
      ]),
    };
    const service = new JiraIssueService(jiraClient as any);

    await expect(service.findAssignableUserByQuery('huy.nq2')).resolves.toEqual(
      {
        accountId: 'account-1',
        displayName: 'Huy Nguyen',
      },
    );
  });
});
