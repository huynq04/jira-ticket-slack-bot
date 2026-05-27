import { Module } from '@nestjs/common';
import { BugParserService } from './bug-parser.service';

@Module({
  providers: [BugParserService],
  exports: [BugParserService],
})
export class ParserModule {}
