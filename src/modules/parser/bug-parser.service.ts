import { Injectable } from '@nestjs/common';
import { ParsedBugDto } from '../ticket/dto/parsed-bug.dto';

type FieldKey =
  | 'module'
  | 'environment'
  | 'steps'
  | 'actualResult'
  | 'expectedResult'
  | 'severity'
  | 'device'
  | 'accountTest';

const LABELS: Array<{ pattern: RegExp; key: FieldKey }> = [
  { pattern: /^module\s*:/i, key: 'module' },
  { pattern: /^environment\s*:/i, key: 'environment' },
  { pattern: /^(steps?|reproduce steps?)\s*:/i, key: 'steps' },
  { pattern: /^(actual|actual result)\s*:/i, key: 'actualResult' },
  { pattern: /^(expected|expected result)\s*:/i, key: 'expectedResult' },
  { pattern: /^severity\s*:/i, key: 'severity' },
  { pattern: /^device\s*:/i, key: 'device' },
  { pattern: /^(account test|test account)\s*:/i, key: 'accountTest' },
];

@Injectable()
export class BugParserService {
  parse(content: string): ParsedBugDto {
    const lines = content.replace(/\r\n/g, '\n').split('\n');
    const firstNonEmpty = lines.find((line) => line.trim().length > 0) ?? 'Bug';
    const result: ParsedBugDto = {
      summary: this.cleanSummary(firstNonEmpty),
      steps: [],
      rawContent: content,
    };

    let currentKey: FieldKey | undefined;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      const label = this.findLabel(line);
      if (label) {
        currentKey = label.key;
        const value = this.valueAfterColon(line);
        this.assign(result, currentKey, value);
        continue;
      }

      if (line === firstNonEmpty.trim()) {
        continue;
      }

      if (currentKey) {
        this.append(result, currentKey, line);
      }
    }

    return result;
  }

  private findLabel(
    line: string,
  ): { pattern: RegExp; key: FieldKey } | undefined {
    return LABELS.find((label) => label.pattern.test(line));
  }

  private valueAfterColon(line: string): string {
    const colonIndex = line.indexOf(':');
    return colonIndex === -1 ? '' : line.slice(colonIndex + 1).trim();
  }

  private cleanSummary(summary: string): string {
    return summary.replace(/^\[BUG\]\s*/i, '').trim() || 'Bug';
  }

  private assign(result: ParsedBugDto, key: FieldKey, value: string): void {
    if (!value) {
      return;
    }
    if (key === 'steps') {
      result.steps.push(this.cleanStep(value));
      return;
    }
    result[key] = value;
  }

  private append(result: ParsedBugDto, key: FieldKey, value: string): void {
    if (key === 'steps') {
      result.steps.push(this.cleanStep(value));
      return;
    }

    const current = result[key];
    result[key] = current ? `${current}\n${value}` : value;
  }

  private cleanStep(value: string): string {
    return value.replace(/^\d+[\).]\s*/, '').trim();
  }
}
