import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from './modules/audit/audit.module';
import { DuplicateModule } from './modules/duplicate/duplicate.module';
import { JiraModule } from './modules/jira/jira.module';
import { MappingModule } from './modules/mapping/mapping.module';
import { ParserModule } from './modules/parser/parser.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { ProjectConfigModule } from './modules/project-config/project-config.module';
import { SlackModule } from './modules/slack/slack.module';
import { TicketModule } from './modules/ticket/ticket.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    PrismaModule,
    AuditModule,
    DuplicateModule,
    ParserModule,
    ProjectConfigModule,
    MappingModule,
    JiraModule,
    TicketModule,
    SlackModule,
  ],
})
export class AppModule {}
