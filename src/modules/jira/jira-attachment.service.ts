import { Injectable } from '@nestjs/common';
import { TicketAttachmentDto } from '../ticket/dto/create-ticket-request.dto';
import { JiraClient } from './jira.client';

@Injectable()
export class JiraAttachmentService {
  constructor(private readonly jiraClient: JiraClient) {}

  uploadAttachment(
    issueKey: string,
    attachment: TicketAttachmentDto,
  ): Promise<unknown> {
    return this.jiraClient.uploadAttachment(issueKey, attachment);
  }

  async uploadAttachments(
    issueKey: string,
    attachments: TicketAttachmentDto[],
  ): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const attachment of attachments) {
      results.push(
        await this.jiraClient.uploadAttachment(issueKey, attachment),
      );
    }
    return results;
  }
}
