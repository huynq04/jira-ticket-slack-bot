import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { SlackSignatureGuard } from './slack-signature.guard';
import { SlackService } from './slack.service';

@Controller('slack/commands')
@UseGuards(SlackSignatureGuard)
export class SlackCommandController {
  constructor(private readonly slackService: SlackService) {}

  @Post()
  async handleCommand(@Body() body: Record<string, string>) {
    return this.slackService.handleSlashCommand(body);
  }
}
