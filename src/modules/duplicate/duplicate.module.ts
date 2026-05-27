import { Module } from '@nestjs/common';
import { DuplicateCheckService } from './duplicate-check.service';

@Module({
  providers: [DuplicateCheckService],
  exports: [DuplicateCheckService],
})
export class DuplicateModule {}
