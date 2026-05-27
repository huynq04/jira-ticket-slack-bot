import { BugParserService } from '../src/modules/parser/bug-parser.service';

describe('BugParserService', () => {
  const service = new BugParserService();

  it('parses a valid Vietnamese bug template', () => {
    const result = service.parse(`[BUG] Không nhận được OTP khi đăng nhập
Module: Login
Environment: UAT
Steps:
1. Mở app
2. Nhập số điện thoại
3. Bấm Đăng nhập
Actual:
Không nhận được OTP
Expected:
Nhận được OTP trong vòng 60 giây
Severity: High`);

    expect(result.summary).toBe('Không nhận được OTP khi đăng nhập');
    expect(result.module).toBe('Login');
    expect(result.environment).toBe('UAT');
    expect(result.steps).toEqual([
      'Mở app',
      'Nhập số điện thoại',
      'Bấm Đăng nhập',
    ]);
    expect(result.actualResult).toBe('Không nhận được OTP');
    expect(result.expectedResult).toBe('Nhận được OTP trong vòng 60 giây');
    expect(result.severity).toBe('High');
  });

  it('tolerates missing severity', () => {
    const result = service.parse(`[BUG] Button does not submit
Module: Checkout
Actual: Nothing happens`);

    expect(result.summary).toBe('Button does not submit');
    expect(result.severity).toBeUndefined();
  });

  it('tolerates missing expected result', () => {
    const result = service.parse(`[BUG] Crash on login
Actual result: App closes`);

    expect(result.actualResult).toBe('App closes');
    expect(result.expectedResult).toBeUndefined();
  });
});
