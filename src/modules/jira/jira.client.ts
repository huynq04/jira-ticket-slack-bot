import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import FormData = require('form-data');
import { firstValueFrom } from 'rxjs';
import { JiraCreateIssuePayload } from '../mapping/jira-field-mapper.service';
import { TicketAttachmentDto } from '../ticket/dto/create-ticket-request.dto';

export interface JiraIssueCreatedResponse {
  id: string;
  key: string;
  self: string;
}

export interface JiraUserSearchResult {
  accountId?: string;
  name?: string;
  key?: string;
  emailAddress?: string;
  displayName?: string;
  active?: boolean;
}

@Injectable()
export class JiraClient {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async createIssue(
    payload: JiraCreateIssuePayload,
  ): Promise<JiraIssueCreatedResponse> {
    const response = await firstValueFrom(
      this.httpService.post<unknown>(`${this.apiBaseUrl()}/issue`, payload, {
        headers: this.buildJsonHeaders(),
      }),
    );
    return this.normalizeCreatedIssueResponse(response.data);
  }

  async getIssue(issueKey: string): Promise<unknown> {
    const response = await firstValueFrom(
      this.httpService.get(`${this.apiBaseUrl()}/issue/${issueKey}`, {
        headers: this.buildJsonHeaders(),
      }),
    );
    this.assertRestJsonResponse(response.data, 'get issue');
    return response.data;
  }

  async searchUsersByEmail(email: string): Promise<JiraUserSearchResult[]> {
    return this.searchUsers(email);
  }

  async searchUsers(query: string): Promise<JiraUserSearchResult[]> {
    const response = await firstValueFrom(
      this.httpService.get<JiraUserSearchResult[]>(
        `${this.apiBaseUrl()}/user/search`,
        {
          headers: this.buildJsonHeaders(),
          params: {
            [this.apiVersion() === '3' ? 'query' : 'username']: query,
            maxResults: 10,
          },
        },
      ),
    );
    return response.data;
  }

  async uploadAttachment(
    issueKey: string,
    attachment: TicketAttachmentDto & { buffer?: Buffer },
  ): Promise<unknown> {
    if (!attachment.buffer) {
      return {
        skipped: true,
        reason: 'Attachment buffer is missing',
        attachmentName: attachment.name,
      };
    }

    const form = new FormData();
    form.append('file', attachment.buffer, {
      filename: attachment.name,
      contentType: attachment.contentType,
    });

    const response = await firstValueFrom(
      this.httpService.post(
        `${this.apiBaseUrl()}/issue/${issueKey}/attachments`,
        form,
        {
          headers: {
            ...this.buildAuthHeaders(),
            ...form.getHeaders(),
            Accept: 'application/json',
            'X-Atlassian-Token': 'no-check',
          },
        },
      ),
    );
    return response.data;
  }

  buildAuthHeaders(): Record<string, string> {
    const jiraEmail = this.configService.get<string>('JIRA_EMAIL');
    const jiraApiToken = this.configService.get<string>('JIRA_API_TOKEN');
    if (jiraEmail && jiraApiToken) {
      const token = Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString(
        'base64',
      );
      return { Authorization: `Basic ${token}` };
    }

    const authType = this.configService
      .get<string>('JIRA_AUTH_TYPE', 'BEARER')
      .toUpperCase();

    if (authType === 'BASIC') {
      const username = this.configService.get<string>(
        'JIRA_USERNAME',
        jiraEmail ?? '',
      );
      const password = this.configService.get<string>(
        'JIRA_PASSWORD',
        jiraApiToken ?? '',
      );
      const token = Buffer.from(`${username}:${password}`).toString('base64');
      return { Authorization: `Basic ${token}` };
    }

    const token = this.configService.get<string>('JIRA_TOKEN', '');
    return { Authorization: `Bearer ${token}` };
  }

  buildJsonHeaders(): Record<string, string> {
    return {
      ...this.buildAuthHeaders(),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  apiVersion(): '2' | '3' {
    const configuredVersion =
      this.configService.get<string>('JIRA_API_VERSION');
    if (configuredVersion === '2' || configuredVersion === '3') {
      return configuredVersion;
    }

    return this.configService.get<string>('JIRA_EMAIL') &&
      this.configService.get<string>('JIRA_API_TOKEN')
      ? '3'
      : '2';
  }

  issueBrowseUrl(issueKey: string): string {
    return `${this.baseUrl()}/browse/${issueKey}`;
  }

  private baseUrl(): string {
    return this.configService
      .get<string>('JIRA_BASE_URL', '')
      .replace(/\/$/, '');
  }

  private apiBaseUrl(): string {
    return `${this.baseUrl()}/rest/api/${this.apiVersion()}`;
  }

  private async normalizeCreatedIssueResponse(
    data: unknown,
  ): Promise<JiraIssueCreatedResponse> {
    this.assertRestJsonResponse(data, 'create issue');

    const key = this.extractString(data, ['key', 'issueKey']);
    const id = this.extractString(data, ['id', 'issueId']);
    const self = this.extractString(data, ['self']) ?? '';

    if (key) {
      return {
        id: id ?? key,
        key,
        self,
      };
    }

    const issueLookupKey = id ?? this.issueIdFromSelf(self);
    if (issueLookupKey) {
      const issue = await this.getIssue(issueLookupKey);
      const fetchedKey = this.extractString(issue, ['key', 'issueKey']);
      const fetchedId = this.extractString(issue, ['id', 'issueId']);
      const fetchedSelf = this.extractString(issue, ['self']);
      if (fetchedKey) {
        return {
          id: fetchedId ?? issueLookupKey,
          key: fetchedKey,
          self: fetchedSelf ?? self,
        };
      }
    }

    throw new Error(
      `Jira create issue response did not include an issue key: ${JSON.stringify(
        data,
      )}`,
    );
  }

  private assertRestJsonResponse(data: unknown, operation: string): void {
    if (typeof data !== 'string') {
      return;
    }

    const normalized = data.trim().toLowerCase();
    if (
      normalized.startsWith('<!doctype html') ||
      normalized.startsWith('<html') ||
      normalized.includes('<title>log into atlassian')
    ) {
      throw new Error(
        `Jira ${operation} returned an HTML login page. Check JIRA_API_VERSION and Jira authentication settings.`,
      );
    }
  }

  private extractString(data: unknown, keys: string[]): string | undefined {
    if (!data || typeof data !== 'object') {
      return undefined;
    }

    const record = data as Record<string, unknown>;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }

    for (const nestedKey of ['issue', 'data']) {
      const nestedValue = record[nestedKey];
      const value = this.extractString(nestedValue, keys);
      if (value) {
        return value;
      }
    }

    return undefined;
  }

  private issueIdFromSelf(self: string | undefined): string | undefined {
    if (!self) {
      return undefined;
    }

    const parts = self.split('/').filter(Boolean);
    return parts[parts.length - 1];
  }
}
