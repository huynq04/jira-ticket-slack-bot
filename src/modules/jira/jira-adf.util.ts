import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type JiraAdfTextNode =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'hardBreak';
    };

interface JiraAdfParagraphNode {
  type: 'paragraph';
  content?: JiraAdfTextNode[];
}

export interface JiraAdfDocument {
  type: 'doc';
  version: 1;
  content: JiraAdfParagraphNode[];
}

@Injectable()
export class JiraAdfUtil {
  constructor(private readonly configService: ConfigService) {}

  toDescriptionField(text: string): string | JiraAdfDocument {
    if (!this.shouldUseAdf()) {
      return text;
    }

    return this.toDocument(text);
  }

  private shouldUseAdf(): boolean {
    const explicitFormat = this.configService
      .get<string>('JIRA_DESCRIPTION_FORMAT')
      ?.toLowerCase();
    if (explicitFormat === 'text') {
      return false;
    }
    if (explicitFormat === 'adf') {
      return true;
    }

    const apiVersion = this.configService.get<string>('JIRA_API_VERSION');
    if (apiVersion) {
      return apiVersion === '3';
    }

    return Boolean(
      this.configService.get<string>('JIRA_EMAIL') &&
      this.configService.get<string>('JIRA_API_TOKEN'),
    );
  }

  private toDocument(text: string): JiraAdfDocument {
    const paragraphs = text.replace(/\r\n/g, '\n').split('\n');
    return {
      type: 'doc',
      version: 1,
      content: paragraphs.map((line) => this.toParagraph(line)),
    };
  }

  private toParagraph(line: string): JiraAdfParagraphNode {
    if (!line) {
      return { type: 'paragraph' };
    }

    return {
      type: 'paragraph',
      content: [{ type: 'text', text: line }],
    };
  }
}
