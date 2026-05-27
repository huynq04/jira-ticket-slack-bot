import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DuplicateModule } from '../duplicate/duplicate.module';
import { JiraModule } from '../jira/jira.module';
import { MappingModule } from '../mapping/mapping.module';
import { ParserModule } from '../parser/parser.module';
import { ProjectConfigModule } from '../project-config/project-config.module';
import { TicketController } from './ticket.controller';
import { TicketService } from './ticket.service';

@Module({
  imports: [
    AuditModule,
    DuplicateModule,
    JiraModule,
    MappingModule,
    ParserModule,
    ProjectConfigModule,
  ],
  controllers: [TicketController],
  providers: [TicketService],
  exports: [TicketService],
})
export class TicketModule {}
