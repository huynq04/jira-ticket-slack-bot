import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DuplicateModule } from '../duplicate/duplicate.module';
import { JiraModule } from '../jira/jira.module';
import { SlackAiTicketParserService } from './slack-ai-ticket-parser.service';
import { SlackFileService } from './slack-file.service';
import { SlackInteractionController } from './slack-interaction.controller';
import { SlackJiraMappingService } from './slack-jira-mapping.service';
import { SlackMessageTicketService } from './slack-message-ticket.service';
import { SlackResponseService } from './slack-response.service';
import { SlackService } from './slack.service';

@Module({
  imports: [AuditModule, DuplicateModule, HttpModule, JiraModule],
  controllers: [SlackInteractionController],
  providers: [
    SlackAiTicketParserService,
    SlackFileService,
    SlackJiraMappingService,
    SlackMessageTicketService,
    SlackService,
    SlackResponseService,
  ],
})
export class SlackModule {}
