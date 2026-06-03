import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { SlackAiTicketParserService } from '../src/modules/slack/slack-ai-ticket-parser.service';

describe('SlackAiTicketParserService', () => {
  const messageText = 'Không login được @huy.nq2';

  it('throws when Groq API key is missing and title must be generated', async () => {
    const service = new SlackAiTicketParserService(
      { post: jest.fn() } as any,
      new ConfigService({}),
    );

    await expect(service.parse(messageText)).rejects.toThrow(
      'GROQ_API_KEY is not configured',
    );
  });

  it('uses explicit Title label without calling Groq', async () => {
    const post = jest.fn();
    const service = new SlackAiTicketParserService(
      { post } as any,
      new ConfigService({}),
    );

    await expect(
      service.parse(
        'Title: Không đăng nhập được LaoID\nAssignee: @huy.nq2\nSteps:\n1. Open app',
      ),
    ).resolves.toEqual({
      title: '[App] Không đăng nhập được LaoID',
      assignee: '@huy.nq2',
      originalText:
        'Title: Không đăng nhập được LaoID\nAssignee: @huy.nq2\nSteps:\n1. Open app',
      descriptionText: 'Steps:\n1. Open app',
    });
    expect(post).not.toHaveBeenCalled();
  });

  it('uses Groq to compose description from tester thread replies', async () => {
    const post = jest.fn().mockReturnValue(
      of({
        data: {
          choices: [
            {
              message: {
                content:
                  'Environment: UAT\nActual: App báo Something went wrong.\nTester note: Lỗi vẫn xảy ra sau khi retry OTP.',
              },
            },
          ],
        },
      }),
    );
    const service = new SlackAiTicketParserService(
      { post } as any,
      new ConfigService({
        GROQ_API_KEY: 'groq-key',
      }),
    );

    await expect(
      service.parse('Title: Không đăng nhập được LaoID\nActual: lỗi login', [
        'Lỗi vẫn xảy ra sau khi retry OTP.',
      ]),
    ).resolves.toEqual({
      title: '[App] Không đăng nhập được LaoID',
      assignee: undefined,
      originalText: 'Title: Không đăng nhập được LaoID\nActual: lỗi login',
      descriptionText:
        'Environment: UAT\nActual: App báo Something went wrong.\nTester note: Lỗi vẫn xảy ra sau khi retry OTP.',
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.objectContaining({
        model: 'llama-3.1-8b-instant',
        max_tokens: 1200,
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer groq-key',
        }),
      }),
    );
  });

  it('cleans markdown headings and removes duplicated bug report title from AI description', async () => {
    const post = jest.fn().mockReturnValue(
      of({
        data: {
          choices: [
            {
              message: {
                content: [
                  '*Bug Report: Không đăng nhập được LaoID trên iPhone 14 - iOS 17*',
                  '',
                  '*Mô tả lỗi:*',
                  'App báo lỗi "Something went wrong".',
                  '',
                  '*Tính nghiêm trọng:*',
                  'Cao',
                ].join('\n'),
              },
            },
          ],
        },
      }),
    );
    const service = new SlackAiTicketParserService(
      { post } as any,
      new ConfigService({
        GROQ_API_KEY: 'groq-key',
      }),
    );

    await expect(
      service.parse('Title: Không đăng nhập được LaoID\nActual: lỗi login', [
        'Tester đã thử lại 5 lần.',
      ]),
    ).resolves.toMatchObject({
      title: '[App] Không đăng nhập được LaoID',
      descriptionText:
        'Mô tả lỗi:\nApp báo lỗi "Something went wrong".\n\nTính nghiêm trọng:\nCao',
    });
  });

  it('generates only the title with Groq when Title label is missing', async () => {
    const post = jest.fn().mockReturnValue(
      of({
        data: {
          choices: [
            {
              message: {
                content: 'Không đăng nhập được LaoID',
              },
            },
          ],
        },
      }),
    );
    const service = new SlackAiTicketParserService(
      { post } as any,
      new ConfigService({
        GROQ_API_KEY: 'groq-key',
        GROQ_MODEL: 'llama-3.1-8b-instant',
      }),
    );

    await expect(
      service.parse(messageText),
    ).resolves.toEqual({
      title: '[App] Không đăng nhập được LaoID',
      assignee: '@huy.nq2',
      originalText: messageText,
      descriptionText: 'Không login được',
    });

    expect(post).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.objectContaining({
        model: 'llama-3.1-8b-instant',
        max_tokens: 500,
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer groq-key',
        }),
      }),
    );
    expect(post.mock.calls[0][1]).not.toHaveProperty('response_format');
  });

  it('assigns the first free-form mention and removes all mentions from description', async () => {
    const post = jest.fn().mockReturnValue(
      of({
        data: {
          choices: [
            {
              message: {
                content: 'LaoID báo Something went wrong sau khi nhập OTP',
              },
            },
          ],
        },
      }),
    );
    const service = new SlackAiTicketParserService(
      { post } as any,
      new ConfigService({
        GROQ_API_KEY: 'groq-key',
      }),
    );

    await expect(
      service.parse(
        'Khi bấm Đăng nhập LaoID xong nhập OTP thì app báo lỗi Something went wrong, không vào được Home. Mong muốn đăng nhập thành công. @huy.nq2 <@U082FRR9Z2P>',
      ),
    ).resolves.toMatchObject({
      title: '[App] LaoID báo Something went wrong sau khi nhập OTP',
      assignee: '@huy.nq2',
      descriptionText:
        'Khi bấm Đăng nhập LaoID xong nhập OTP thì app báo lỗi Something went wrong, không vào được Home. Mong muốn đăng nhập thành công.',
    });
  });

  it('uses only the first mention from an Assignee label with multiple people', async () => {
    const service = new SlackAiTicketParserService(
      { post: jest.fn() } as any,
      new ConfigService({}),
    );

    await expect(
      service.parse(
        [
          'Title: Không đăng nhập được LaoID',
          'Assignee: @huy.nq2 @huong.nt1',
          '',
          'Environment: UAT',
          'Actual:',
          'App báo lỗi "Something went wrong".',
        ].join('\n'),
      ),
    ).resolves.toEqual({
      title: '[App] Không đăng nhập được LaoID',
      assignee: '@huy.nq2',
      originalText: [
        'Title: Không đăng nhập được LaoID',
        'Assignee: @huy.nq2 @huong.nt1',
        '',
        'Environment: UAT',
        'Actual:',
        'App báo lỗi "Something went wrong".',
      ].join('\n'),
      descriptionText: 'Environment: UAT\nActual:\nApp báo lỗi "Something went wrong".',
    });
  });

  it('accepts a JSON title if the model ignores the plain-text instruction', async () => {
    const post = jest.fn().mockReturnValue(
      of({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: '[App] Không nhận OTP khi đăng nhập LaoID',
                }),
              },
            },
          ],
        },
      }),
    );
    const service = new SlackAiTicketParserService(
      { post } as any,
      new ConfigService({
        GROQ_API_KEY: 'groq-key',
      }),
    );

    await expect(
      service.parse('Không nhận OTP khi đăng nhập LaoID'),
    ).resolves.toMatchObject({
      title: '[App] Không nhận OTP khi đăng nhập LaoID',
      assignee: undefined,
      descriptionText: 'Không nhận OTP khi đăng nhập LaoID',
    });
  });

  it('tries the next Groq model when the first one returns empty content', async () => {
    const post = jest
      .fn()
      .mockReturnValueOnce(
        of({
          data: {
            choices: [
              {
                finish_reason: 'length',
                message: {
                  content: null,
                },
              },
            ],
          },
        }),
      )
      .mockReturnValueOnce(
        of({
          data: {
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: 'Không nhận OTP khi đăng nhập LaoID',
                },
              },
            ],
          },
        }),
      );
    const service = new SlackAiTicketParserService(
      { post } as any,
      new ConfigService({
        GROQ_API_KEY: 'groq-key',
        GROQ_MODEL: 'empty-model',
        GROQ_FALLBACK_MODELS: 'working-model',
      }),
    );

    await expect(
      service.parse('Không nhận OTP khi đăng nhập LaoID'),
    ).resolves.toMatchObject({
      title: '[App] Không nhận OTP khi đăng nhập LaoID',
    });

    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0][1]).toEqual(
      expect.objectContaining({ model: 'empty-model' }),
    );
    expect(post.mock.calls[1][1]).toEqual(
      expect.objectContaining({ model: 'working-model' }),
    );
  });

  it('throws when Groq returns a detail field as title', async () => {
    const post = jest.fn().mockReturnValue(
      of({
        data: {
          choices: [
            {
              message: {
                content: 'Steps: mở app, nhập OTP',
              },
            },
          ],
        },
      }),
    );
    const service = new SlackAiTicketParserService(
      { post } as any,
      new ConfigService({
        GROQ_API_KEY: 'groq-key',
      }),
    );

    await expect(
      service.parse(messageText),
    ).rejects.toThrow(
      'AI parser returned an invalid title: Steps: mở app, nhập OTP',
    );
  });
});
