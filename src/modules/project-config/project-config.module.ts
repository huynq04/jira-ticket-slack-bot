import { Module } from '@nestjs/common';
import { JiraProjectConfigService } from './jira-project-config.service';

@Module({
  providers: [JiraProjectConfigService],
  exports: [JiraProjectConfigService],
})
export class ProjectConfigModule {}
