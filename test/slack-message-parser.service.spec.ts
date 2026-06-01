import { SlackMessageParserService } from '../src/modules/slack/slack-message-parser.service';

describe('SlackMessageParserService', () => {
  const service = new SlackMessageParserService();

  it('uses Title label as Jira summary and parses assignee', () => {
    const parsed = service.parse(
      'Title: Không đăng nhập được LaoID\nAssignee: @hung\nSteps:\n1. Open app',
    );

    expect(parsed.title).toBe('Không đăng nhập được LaoID');
    expect(parsed.assignee).toBe('@hung');
    expect(parsed.originalText).toContain('Steps:');
    expect(parsed.descriptionText).toBe('Steps:\n1. Open app');
  });

  it('falls back to the first non-empty line as Jira summary', () => {
    const parsed = service.parse('\n\nKhông nhận được OTP\nActual: timeout');

    expect(parsed.title).toBe('Không nhận được OTP');
    expect(parsed.assignee).toBeUndefined();
    expect(parsed.descriptionText).toBe('Không nhận được OTP\nActual: timeout');
  });
});
