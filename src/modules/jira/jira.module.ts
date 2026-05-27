import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { JiraAttachmentService } from './jira-attachment.service';
import { JiraClient } from './jira.client';
import { JiraIssueService } from './jira-issue.service';

@Module({
  imports: [HttpModule],
  providers: [JiraClient, JiraIssueService, JiraAttachmentService],
  exports: [JiraClient, JiraIssueService, JiraAttachmentService],
})
export class JiraModule {}
