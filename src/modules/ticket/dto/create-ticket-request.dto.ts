import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';

export class TicketSourceDto {
  @IsIn(['SLACK'])
  platform: 'SLACK';

  @IsString()
  workspaceId: string;

  @IsString()
  channelId: string;

  @IsString()
  messageId: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  messageUrl?: string;
}

export class TicketSenderDto {
  @IsString()
  platformUserId: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  email?: string;
}

export class TicketCommandDto {
  @IsOptional()
  @IsString()
  rawText?: string;

  @IsOptional()
  @IsString()
  projectKey?: string;

  @IsOptional()
  @IsString()
  issueType?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsString()
  assignee?: string;
}

export class TicketAttachmentDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  contentType?: string;

  @IsOptional()
  @IsString()
  url?: string;
}

export class TicketMessageDto {
  @IsString()
  content: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TicketAttachmentDto)
  attachments: TicketAttachmentDto[] = [];
}

export class CreateTicketRequestDto {
  @ValidateNested()
  @Type(() => TicketSourceDto)
  source: TicketSourceDto;

  @ValidateNested()
  @Type(() => TicketSenderDto)
  sender: TicketSenderDto;

  @ValidateNested()
  @Type(() => TicketCommandDto)
  command: TicketCommandDto;

  @ValidateNested()
  @Type(() => TicketMessageDto)
  message: TicketMessageDto;
}
