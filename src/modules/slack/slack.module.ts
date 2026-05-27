import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { JiraModule } from '../jira/jira.module';
import { TicketModule } from '../ticket/ticket.module';
import { SlackCommandController } from './slack-command.controller';
import { SlackInteractionController } from './slack-interaction.controller';
import { SlackResponseService } from './slack-response.service';
import { SlackService } from './slack.service';

@Module({
  imports: [HttpModule, JiraModule, TicketModule],
  controllers: [SlackCommandController, SlackInteractionController],
  providers: [SlackService, SlackResponseService],
})
export class SlackModule {}
