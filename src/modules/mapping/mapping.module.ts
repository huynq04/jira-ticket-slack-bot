import { Module } from '@nestjs/common';
import { JiraFieldMapperService } from './jira-field-mapper.service';

@Module({
  providers: [JiraFieldMapperService],
  exports: [JiraFieldMapperService],
})
export class MappingModule {}
