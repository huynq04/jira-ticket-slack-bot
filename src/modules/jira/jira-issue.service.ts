import { Injectable } from '@nestjs/common';
import { JiraCreateIssuePayload } from '../mapping/jira-field-mapper.service';
import { JiraClient, JiraIssueCreatedResponse } from './jira.client';

@Injectable()
export class JiraIssueService {
  constructor(private readonly jiraClient: JiraClient) {}

  createIssue(
    payload: JiraCreateIssuePayload,
  ): Promise<JiraIssueCreatedResponse> {
    return this.jiraClient.createIssue(payload);
  }

  issueBrowseUrl(issueKey: string): string {
    return this.jiraClient.issueBrowseUrl(issueKey);
  }

  async findUsernameByEmail(email: string): Promise<string | undefined> {
    const users = await this.jiraClient.searchUsersByEmail(email);
    const exactMatch =
      users.find(
        (user) =>
          user.active !== false &&
          user.emailAddress?.toLowerCase() === email.toLowerCase() &&
          user.name,
      ) ?? users.find((user) => user.active !== false && user.name);

    return exactMatch?.name;
  }
}
