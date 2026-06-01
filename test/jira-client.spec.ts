import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
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

  it('uses Jira Cloud email and API token when configured', () => {
    const config = new ConfigService({
      JIRA_EMAIL: 'tester@example.com',
      JIRA_API_TOKEN: 'api-token',
    });
    const client = new JiraClient({} as any, config);

    expect(client.buildAuthHeaders()).toEqual({
      Authorization: `Basic ${Buffer.from(
        'tester@example.com:api-token',
      ).toString('base64')}`,
    });
    expect(client.apiVersion()).toBe('3');
  });

  it('resolves the issue key after create when Jira only returns an id', async () => {
    const post = jest.fn().mockReturnValue(
      of({
        data: {
          id: '10017',
          self: 'https://jira.example.com/rest/api/2/issue/10017',
        },
      }),
    );
    const get = jest.fn().mockReturnValue(
      of({
        data: {
          id: '10017',
          key: 'JBT-17',
          self: 'https://jira.example.com/rest/api/2/issue/10017',
        },
      }),
    );
    const config = new ConfigService({
      JIRA_BASE_URL: 'https://jira.example.com',
      JIRA_AUTH_TYPE: 'BEARER',
      JIRA_TOKEN: 'token-123',
    });
    const client = new JiraClient({ get, post } as any, config);

    await expect(
      client.createIssue({
        fields: {
          project: { key: 'JBT' },
          summary: 'Bug',
          issuetype: { name: 'Bug' },
        },
      }),
    ).resolves.toEqual({
      id: '10017',
      key: 'JBT-17',
      self: 'https://jira.example.com/rest/api/2/issue/10017',
    });

    expect(get).toHaveBeenCalledWith(
      'https://jira.example.com/rest/api/2/issue/10017',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      }),
    );
  });

  it('uploads attachments as multipart form data', async () => {
    const post = jest.fn().mockReturnValue(of({ data: [{ id: 'att-1' }] }));
    const config = new ConfigService({
      JIRA_BASE_URL: 'https://jira.example.com',
      JIRA_EMAIL: 'tester@example.com',
      JIRA_API_TOKEN: 'api-token',
      JIRA_API_VERSION: '3',
    });
    const client = new JiraClient({ post } as any, config);

    await expect(
      client.uploadAttachment('JBT-17', {
        name: 'image.png',
        contentType: 'image/png',
        buffer: Buffer.from('png'),
      }),
    ).resolves.toEqual([{ id: 'att-1' }]);

    expect(post).toHaveBeenCalledWith(
      'https://jira.example.com/rest/api/3/issue/JBT-17/attachments',
      expect.objectContaining({
        append: expect.any(Function),
        getHeaders: expect.any(Function),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
          'X-Atlassian-Token': 'no-check',
        }),
      }),
    );
  });

  it('throws a clear error when Jira returns a login page', async () => {
    const post = jest.fn().mockReturnValue(
      of({
        data: '<!DOCTYPE html><html><head><title>Log into Atlassian - JIRA</title></head></html>',
      }),
    );
    const config = new ConfigService({
      JIRA_BASE_URL: 'https://jira.example.com',
      JIRA_AUTH_TYPE: 'BEARER',
      JIRA_TOKEN: 'token-123',
    });
    const client = new JiraClient({ post } as any, config);

    await expect(
      client.createIssue({
        fields: {
          project: { key: 'JBT' },
          summary: 'Bug',
          issuetype: { name: 'Bug' },
        },
      }),
    ).rejects.toThrow(
      'Jira create issue returned an HTML login page. Check JIRA_API_VERSION and Jira authentication settings.',
    );
  });
});
