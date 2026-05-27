import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { SlackSignatureGuard } from './slack-signature.guard';
import { SlackService } from './slack.service';

@Controller('slack/interactions')
@UseGuards(SlackSignatureGuard)
export class SlackInteractionController {
  constructor(private readonly slackService: SlackService) {}

  @Post()
  async handleInteraction(@Body() body: { payload?: string }) {
    return this.slackService.handleInteraction(body.payload);
  }
}
