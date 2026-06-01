import { Injectable } from '@nestjs/common';

export interface ParsedSlackMessage {
  title: string;
  assignee?: string;
  originalText: string;
  descriptionText: string;
}

@Injectable()
export class SlackMessageParserService {
  parse(text: string | undefined): ParsedSlackMessage {
    const originalText = (text ?? '').trim();
    const lines = originalText.replace(/\r\n/g, '\n').split('\n');
    const explicitTitle = this.findLabelValue(
      lines,
      /^(title|tiêu đề|tieu de)$/i,
    );
    const firstNonEmpty =
      lines.find((line) => line.trim().length > 0)?.trim() ?? 'Slack bug';

    return {
      title: this.cleanTitle(explicitTitle ?? firstNonEmpty),
      assignee: this.findLabelValue(
        lines,
        /^(assignee|người xử lý|nguoi xu ly)$/i,
      ),
      originalText,
      descriptionText: this.stripMetadataLines(lines),
    };
  }

  private findLabelValue(
    lines: string[],
    labelPattern: RegExp,
  ): string | undefined {
    for (const rawLine of lines) {
      const colonIndex = rawLine.indexOf(':');
      if (colonIndex === -1) {
        continue;
      }

      const label = rawLine.slice(0, colonIndex).trim();
      const value = rawLine.slice(colonIndex + 1).trim();
      if (labelPattern.test(label) && value) {
        return value;
      }
    }

    return undefined;
  }

  private cleanTitle(title: string): string {
    return (
      title
        .replace(/^(title|tiêu đề|tieu de)\s*:\s*/i, '')
        .replace(/^\[BUG\]\s*/i, '')
        .trim()
        .slice(0, 255) || 'Slack bug'
    );
  }

  private stripMetadataLines(lines: string[]): string {
    return lines
      .filter((rawLine) => !this.isMetadataLine(rawLine))
      .join('\n')
      .trim();
  }

  private isMetadataLine(rawLine: string): boolean {
    const colonIndex = rawLine.indexOf(':');
    if (colonIndex === -1) {
      return false;
    }

    const label = rawLine.slice(0, colonIndex).trim();
    return /^(title|tiêu đề|tieu de|assignee|người xử lý|nguoi xu ly)$/i.test(
      label,
    );
  }
}
