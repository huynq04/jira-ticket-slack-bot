import { JiraFieldMapperService } from '../src/modules/mapping/jira-field-mapper.service';

describe('JiraFieldMapperService', () => {
  const service = new JiraFieldMapperService();

  it('maps parsed bug to Jira REST API v2 create issue payload', () => {
    const payload = service.mapToCreateIssuePayload({
      parsedBug: {
        summary: 'Không nhận được OTP khi đăng nhập',
        module: 'Login',
        environment: 'UAT',
        steps: ['Mở app', 'Nhập số điện thoại'],
        actualResult: 'Không nhận được OTP',
        expectedResult: 'Nhận được OTP trong vòng 60 giây',
        severity: 'High',
        rawContent: 'raw',
      },
      config: {
        projectKey: 'APP',
        defaultIssueType: 'Bug',
        defaultPriority: 'Medium',
        componentMapping: { Login: 'Authentication' },
        severityPriorityMapping: { High: 'High' },
      },
      command: { assignee: 'hung.nq' },
      sourceUrl: 'https://company.slack.com/archives/C123/p171',
    });

    expect(payload.fields.project).toEqual({ key: 'APP' });
    expect(payload.fields.summary).toBe(
      '[Login] Không nhận được OTP khi đăng nhập',
    );
    expect(payload.fields.issuetype).toEqual({ name: 'Bug' });
    expect(payload.fields.priority).toEqual({ name: 'High' });
    expect(payload.fields.assignee).toEqual({ name: 'hung.nq' });
    expect(payload.fields.components).toEqual([{ name: 'Authentication' }]);
    expect(payload.fields.description).toContain('Source: https://company');
  });

  it('uses default priority when severity is missing', () => {
    const payload = service.mapToCreateIssuePayload({
      parsedBug: {
        summary: 'Bug',
        steps: [],
        rawContent: 'Bug',
      },
      config: {
        projectKey: 'APP',
        defaultIssueType: 'Bug',
        defaultPriority: 'Medium',
        componentMapping: {},
        severityPriorityMapping: {},
      },
    });

    expect(payload.fields.priority).toEqual({ name: 'Medium' });
  });
});
