import { ConfigService } from '@nestjs/config';
import { JiraClient } from '../src/modules/jira/jira.client';

describe('JiraClient', () => {
  it('builds bearer auth headers', () => {
    const config = new ConfigService({
      JIRA_AUTH_TYPE: 'BEARER',
      JIRA_TOKEN: 'token-123',
    });
    const client = new JiraClient({} as any, config);

    expect(client.buildAuthHeaders()).toEqual({
      Authorization: 'Bearer token-123',
    });
  });

  it('builds basic auth headers', () => {
    const config = new ConfigService({
      JIRA_AUTH_TYPE: 'BASIC',
      JIRA_USERNAME: 'user',
      JIRA_PASSWORD: 'pass',
    });
    const client = new JiraClient({} as any, config);

    expect(client.buildAuthHeaders()).toEqual({
      Authorization: `Basic ${Buffer.from('user:pass').toString('base64')}`,
    });
  });
});
