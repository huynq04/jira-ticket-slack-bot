import { Injectable } from '@nestjs/common';
import { JiraCreateIssuePayload } from '../mapping/jira-field-mapper.service';
import {
  JiraClient,
  JiraIssueCreatedResponse,
  JiraUserSearchResult,
} from './jira.client';

export interface JiraAssignableUser {
  accountId?: string;
  name?: string;
  displayName?: string;
}

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

  async findAccountIdByEmail(email: string): Promise<string | undefined> {
    const users = await this.jiraClient.searchUsersByEmail(email);
    const exactMatch =
      users.find(
        (user) =>
          user.active !== false &&
          user.emailAddress?.toLowerCase() === email.toLowerCase() &&
          user.accountId,
      ) ?? users.find((user) => user.active !== false && user.accountId);

    return exactMatch?.accountId;
  }

  async findAssignableUserByQuery(
    query: string,
  ): Promise<JiraAssignableUser | undefined> {
    const normalizedQuery = this.normalizeUserQuery(query);
    if (!normalizedQuery) {
      return undefined;
    }

    const users = await this.jiraClient.searchUsers(normalizedQuery);
    const exactMatch =
      users.find((user) => this.isExactUserMatch(user, normalizedQuery)) ??
      users.find((user) => user.active !== false);

    if (!exactMatch) {
      return undefined;
    }

    return {
      accountId: exactMatch.accountId,
      name: exactMatch.name ?? exactMatch.key,
      displayName: exactMatch.displayName,
    };
  }

  private normalizeUserQuery(query: string): string {
    return query
      .trim()
      .replace(/^@/, '')
      .replace(/^<@([A-Z0-9]+)(?:\|([^>]+))?>$/i, '$2')
      .trim();
  }

  private isExactUserMatch(
    user: JiraUserSearchResult,
    normalizedQuery: string,
  ): boolean {
    if (user.active === false) {
      return false;
    }

    const candidates = [
      user.name,
      user.key,
      user.displayName,
      user.emailAddress,
      user.accountId,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    return candidates.includes(normalizedQuery.toLowerCase());
  }
}
