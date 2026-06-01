import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { JiraAttachmentService } from './jira-attachment.service';
import { JiraAdfUtil } from './jira-adf.util';
import { JiraClient } from './jira.client';
import { JiraIssueService } from './jira-issue.service';

@Module({
  imports: [HttpModule],
  providers: [JiraClient, JiraIssueService, JiraAttachmentService, JiraAdfUtil],
  exports: [JiraClient, JiraIssueService, JiraAttachmentService, JiraAdfUtil],
})
export class JiraModule {}
