import { IsArray, IsOptional, IsString } from 'class-validator';

export class ParsedBugDto {
  @IsString()
  summary: string;

  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsString()
  environment?: string;

  @IsArray()
  @IsString({ each: true })
  steps: string[];

  @IsOptional()
  @IsString()
  actualResult?: string;

  @IsOptional()
  @IsString()
  expectedResult?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  device?: string;

  @IsOptional()
  @IsString()
  accountTest?: string;

  @IsString()
  rawContent: string;
}
