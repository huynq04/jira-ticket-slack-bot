import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { TicketAttachmentDto } from '../ticket/dto/create-ticket-request.dto';

export interface SlackFilePayload {
  id?: string;
  name?: string;
  title?: string;
  mimetype?: string;
  url_private?: string;
  url_private_download?: string;
  size?: number;
}

export interface SlackFileFailure {
  name: string;
  reason: string;
}

export interface SlackFileDownloadResult {
  attachments: TicketAttachmentDto[];
  failures: SlackFileFailure[];
}

@Injectable()
export class SlackFileService {
  private readonly logger = new Logger(SlackFileService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async downloadFiles(
    files: SlackFilePayload[] | undefined,
  ): Promise<SlackFileDownloadResult> {
    const result: SlackFileDownloadResult = {
      attachments: [],
      failures: [],
    };
    if (!files?.length) {
      return result;
    }

    const token = this.configService.get<string>('SLACK_BOT_TOKEN');
    if (!token) {
      return {
        attachments: [],
        failures: files.map((file) => ({
          name: this.fileName(file),
          reason: 'Missing SLACK_BOT_TOKEN',
        })),
      };
    }

    for (const file of files) {
      const name = this.fileName(file);
      try {
        const failure = this.validateFile(file);
        if (failure) {
          result.failures.push({ name, reason: failure });
          continue;
        }

        const downloadUrl = file.url_private_download ?? file.url_private;
        if (!downloadUrl) {
          result.failures.push({ name, reason: 'Missing Slack download URL' });
          continue;
        }

        const response = await firstValueFrom(
          this.httpService.get<ArrayBuffer>(downloadUrl, {
            headers: { Authorization: `Bearer ${token}` },
            responseType: 'arraybuffer',
          }),
        );

        result.attachments.push({
          name,
          contentType: file.mimetype,
          url: downloadUrl,
          buffer: Buffer.from(response.data),
        });
      } catch (error) {
        this.logger.warn(
          `Failed to download Slack file ${name}: ${this.cleanError(error)}`,
        );
        result.failures.push({ name, reason: this.cleanError(error) });
      }
    }

    return result;
  }

  private validateFile(file: SlackFilePayload): string | undefined {
    const size = file.size ?? 0;
    const maxSizeMb = Number(
      this.configService.get<string>('JIRA_MAX_ATTACHMENT_SIZE_MB', '50'),
    );
    const maxSizeBytes = maxSizeMb * 1024 * 1024;
    if (size > maxSizeBytes) {
      return `File exceeds ${maxSizeMb}MB`;
    }

    return undefined;
  }

  private fileName(file: SlackFilePayload): string {
    return file.name ?? file.title ?? file.id ?? 'slack-file';
  }

  private cleanError(error: unknown): string {
    if (this.isAxiosError(error) && error.response?.status) {
      return `Slack responded with HTTP ${error.response.status}`;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private isAxiosError(error: unknown): error is {
    response?: {
      status?: number;
    };
  } {
    return typeof error === 'object' && error !== null && 'response' in error;
  }
}
