import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import FormData from 'form-data';
import { firstValueFrom } from 'rxjs';
import { JiraCreateIssuePayload } from '../mapping/jira-field-mapper.service';
import { TicketAttachmentDto } from '../ticket/dto/create-ticket-request.dto';

export interface JiraIssueCreatedResponse {
  id: string;
  key: string;
  self: string;
}

export interface JiraUserSearchResult {
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
      this.httpService.post<JiraIssueCreatedResponse>(
        `${this.baseUrl()}/rest/api/2/issue`,
        payload,
        { headers: this.buildAuthHeaders() },
      ),
    );
    return response.data;
  }

  async getIssue(issueKey: string): Promise<unknown> {
    const response = await firstValueFrom(
      this.httpService.get(`${this.baseUrl()}/rest/api/2/issue/${issueKey}`, {
        headers: this.buildAuthHeaders(),
      }),
    );
    return response.data;
  }

  async searchUsersByEmail(email: string): Promise<JiraUserSearchResult[]> {
    const response = await firstValueFrom(
      this.httpService.get<JiraUserSearchResult[]>(
        `${this.baseUrl()}/rest/api/2/user/search`,
        {
          headers: this.buildAuthHeaders(),
          params: {
            username: email,
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
        reason: 'Slack file download is not implemented for MVP',
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
        `${this.baseUrl()}/rest/api/2/issue/${issueKey}/attachments`,
        form,
        {
          headers: {
            ...this.buildAuthHeaders(),
            ...form.getHeaders(),
            'X-Atlassian-Token': 'no-check',
          },
        },
      ),
    );
    return response.data;
  }

  buildAuthHeaders(): Record<string, string> {
    const authType = this.configService
      .get<string>('JIRA_AUTH_TYPE', 'BEARER')
      .toUpperCase();

    if (authType === 'BASIC') {
      const username = this.configService.get<string>('JIRA_USERNAME', '');
      const password = this.configService.get<string>('JIRA_PASSWORD', '');
      const token = Buffer.from(`${username}:${password}`).toString('base64');
      return { Authorization: `Basic ${token}` };
    }

    const token = this.configService.get<string>('JIRA_TOKEN', '');
    return { Authorization: `Bearer ${token}` };
  }

  issueBrowseUrl(issueKey: string): string {
    return `${this.baseUrl()}/browse/${issueKey}`;
  }

  private baseUrl(): string {
    return this.configService
      .get<string>('JIRA_BASE_URL', '')
      .replace(/\/$/, '');
  }
}
