import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface ParsedSlackMessage {
  title: string;
  assignee?: string;
  originalText: string;
  descriptionText: string;
}

interface GroqChatResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
    };
  }>;
}

interface GroqMessage {
  role: 'system' | 'user';
  content: string;
}

@Injectable()
export class SlackAiTicketParserService {
  private readonly logger = new Logger(SlackAiTicketParserService.name);
  private readonly defaultFallbackModels = [
    'llama-3.1-8b-instant',
    'qwen/qwen3-32b',
  ];

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async parse(
    messageText: string,
    threadMessages: string[] = [],
  ): Promise<ParsedSlackMessage> {
    const originalText = messageText.trim();
    if (!originalText) {
      throw new Error('Slack message content is empty');
    }

    const localFields = this.extractLocalFields(originalText);
    const descriptionSource = this.descriptionSource(originalText, threadMessages);
    const localDescription = this.localThreadDescription(
      localFields.descriptionText,
      threadMessages,
    );
    const apiKey = this.configService.get<string>('GROQ_API_KEY');
    const descriptionText = await this.descriptionText({
      apiKey,
      localDescription,
      sourceText: descriptionSource,
      useAi: threadMessages.length > 0,
    });

    if (localFields.title) {
      return {
        title: this.titleWithPlatformPrefix(
          this.requireTitle(localFields.title),
          descriptionSource,
        ),
        assignee: localFields.assignee,
        originalText,
        descriptionText,
      };
    }

    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not configured');
    }

    const aiTitle = await this.callGroqForTitle({
      apiKey,
      messageText: originalText,
    });

    return {
      title: this.titleWithPlatformPrefix(
        this.requireTitle(aiTitle),
        descriptionSource,
      ),
      assignee: localFields.assignee,
      originalText,
      descriptionText,
    };
  }

  private async descriptionText(params: {
    apiKey?: string;
    localDescription: string;
    sourceText: string;
    useAi: boolean;
  }): Promise<string> {
    if (!params.useAi || !params.apiKey) {
      return params.localDescription;
    }

    try {
      return await this.callGroqForDescription({
        apiKey: params.apiKey,
        sourceText: params.sourceText,
      });
    } catch (error) {
      this.logger.warn(
        `Groq description generation failed, using cleaned Slack content: ${this.cleanError(
          error,
        )}`,
      );
      return params.localDescription;
    }
  }

  private async callGroqForTitle(params: {
    apiKey: string;
    messageText: string;
  }): Promise<string> {
    const models = this.groqModels();
    const failures: string[] = [];

    for (const model of models) {
      try {
        const title = await this.callGroqModelForTitle({
          ...params,
          model,
        });
        return title;
      } catch (error) {
        const reason = this.cleanError(error);
        failures.push(`${model}: ${reason}`);
        this.logger.warn(
          `Groq title generation failed with model ${model}: ${reason}`,
        );
      }
    }

    throw new Error(
      `AI title generation failed for all configured models: ${failures.join(
        ' | ',
      )}`,
    );
  }

  private async callGroqForDescription(params: {
    apiKey: string;
    sourceText: string;
  }): Promise<string> {
    const models = this.groqModels();
    const failures: string[] = [];

    for (const model of models) {
      try {
        const description = await this.callGroqModelForDescription({
          ...params,
          model,
        });
        return this.cleanAiDescription(description);
      } catch (error) {
        const reason = this.cleanError(error);
        failures.push(`${model}: ${reason}`);
        this.logger.warn(
          `Groq description generation failed with model ${model}: ${reason}`,
        );
      }
    }

    throw new Error(
      `AI description generation failed for all configured models: ${failures.join(
        ' | ',
      )}`,
    );
  }

  private async callGroqModelForTitle(params: {
    apiKey: string;
    messageText: string;
    model: string;
  }): Promise<string> {
    this.logger.log(
      `Calling Groq title generator with model ${params.model}`,
    );

    const response = await firstValueFrom(
      this.httpService.post<GroqChatResponse>(
        this.configService.get<string>(
          'GROQ_BASE_URL',
          'https://api.groq.com/openai/v1',
        ) + '/chat/completions',
        {
          model: params.model,
          messages: [
            { role: 'system', content: this.titlePrompt() },
            { role: 'user', content: params.messageText },
          ] satisfies GroqMessage[],
          temperature: 0,
          max_tokens: 500,
        },
        {
          headers: {
            Authorization: `Bearer ${params.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    const responseData = this.normalizeResponse(response.data);
    const choice = responseData.choices?.[0];
    const content = choice?.message?.content;
    if (!content) {
      throw new Error(
        `AI parser returned an empty title response${
          choice?.finish_reason ? ` (finish_reason: ${choice.finish_reason})` : ''
        }`,
      );
    }

    return this.cleanAiTitle(content);
  }

  private async callGroqModelForDescription(params: {
    apiKey: string;
    sourceText: string;
    model: string;
  }): Promise<string> {
    this.logger.log(
      `Calling Groq description composer with model ${params.model}`,
    );

    const response = await firstValueFrom(
      this.httpService.post<GroqChatResponse>(
        this.configService.get<string>(
          'GROQ_BASE_URL',
          'https://api.groq.com/openai/v1',
        ) + '/chat/completions',
        {
          model: params.model,
          messages: [
            { role: 'system', content: this.descriptionPrompt() },
            { role: 'user', content: params.sourceText },
          ] satisfies GroqMessage[],
          temperature: 0,
          max_tokens: 1200,
        },
        {
          headers: {
            Authorization: `Bearer ${params.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    const responseData = this.normalizeResponse(response.data);
    const choice = responseData.choices?.[0];
    const content = choice?.message?.content;
    if (!content) {
      throw new Error(
        `AI parser returned an empty description response${
          choice?.finish_reason ? ` (finish_reason: ${choice.finish_reason})` : ''
        }`,
      );
    }

    return content;
  }

  private groqModels(): string[] {
    const primary = this.configService.get<string>(
      'GROQ_MODEL',
      this.defaultFallbackModels[0],
    );
    const configuredFallbacks = this.configService
      .get<string>('GROQ_FALLBACK_MODELS', '')
      .split(',')
      .map((model) => model.trim())
      .filter(Boolean);

    return [
      ...new Set([primary, ...configuredFallbacks, ...this.defaultFallbackModels]),
    ];
  }

  private normalizeResponse(
    responseData: GroqChatResponse | string,
  ): GroqChatResponse {
    if (typeof responseData !== 'string') {
      return responseData;
    }

    try {
      return JSON.parse(responseData.trim()) as GroqChatResponse;
    } catch {
      throw new Error(
        `Groq returned a non-JSON response: ${responseData.slice(0, 200)}`,
      );
    }
  }

  private titlePrompt(): string {
    return [
      'You generate a Jira issue title from a Slack bug report written by a tester.',
      'Return plain text only. Do not return JSON. Do not use markdown.',
      'The title must be Vietnamese if the input is Vietnamese.',
      'Maximum 80 characters.',
      'Describe the broken feature or actual problem.',
      'Do not start with Steps, Actual, Expected, Severity, Environment, or Device.',
      'Never copy the whole input.',
      'Do not include assignee, severity, environment, or device unless needed to understand the bug.',
    ].join('\n');
  }

  private descriptionPrompt(): string {
    return [
      'You compose a clean Jira bug description from a Slack message and tester thread replies.',
      'Return plain text only. Do not return JSON. Do not use markdown tables.',
      'Use Vietnamese if the source is Vietnamese.',
      'Keep concrete bug details: environment, device, steps, actual result, expected result, severity, and useful tester comments.',
      'Do not add a Bug Report title line or repeat the Jira title in the description.',
      'Do not wrap headings or text with asterisks.',
      'Ignore bot messages, Slack IDs, user mentions, assignment-only text, duplicated chatter, and irrelevant acknowledgements.',
      'Do not invent data.',
    ].join('\n');
  }

  private descriptionSource(
    originalText: string,
    threadMessages: string[],
  ): string {
    if (!threadMessages.length) {
      return originalText;
    }

    return [
      'Message gốc:',
      originalText,
      '',
      'Nội dung thread từ tester:',
      ...threadMessages.map((message) => `- ${message}`),
    ].join('\n');
  }

  private localThreadDescription(
    originalDescription: string,
    threadMessages: string[],
  ): string {
    return [
      originalDescription,
      ...threadMessages.map(
        (message) => this.extractLocalFields(message).descriptionText,
      ),
    ]
      .map((message) => message.trim())
      .filter(Boolean)
      .join('\n\n');
  }

  private extractLocalFields(text: string): {
    title?: string;
    assignee?: string;
    descriptionText: string;
  } {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const title = this.findLabelValue(lines, /^(title|tiêu đề|tieu de)$/i);
    const assigneeLabel = this.findLabelValue(
      lines,
      /^(assignee|người xử lý|nguoi xu ly)$/i,
    );
    const assignee = this.findFreeformAssignee(assigneeLabel ?? text);

    return {
      title,
      assignee,
      descriptionText: this.cleanDescription(lines),
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

  private findFreeformAssignee(text: string): string | undefined {
    const match = text.match(/<@[A-Z0-9]+(?:\|[^>]+)?>|(^|\s)(@[\w.-]+)/i);
    if (!match) {
      return undefined;
    }

    return match[2] ?? match[0].trim();
  }

  private cleanDescription(lines: string[]): string {
    const description = lines
      .filter((rawLine) => !this.isMetadataLine(rawLine))
      .join('\n')
      .trim();

    return this.cleanDescriptionText(description);
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

  private removeAssignmentMentions(text: string): string {
    return text
      .replace(/<@[A-Z0-9]+(?:\|[^>]+)?>/gi, '')
      .replace(/(^|\s)@[\w.-]+/g, '$1')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .trim();
  }

  private cleanAiTitle(content: string): string {
    const trimmed = content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(trimmed) as {
        title?: unknown;
        summary?: unknown;
      };
      if (typeof parsed.title === 'string') {
        return parsed.title;
      }
      if (typeof parsed.summary === 'string') {
        return parsed.summary;
      }
    } catch {
      // The prompt asks for plain text, so non-JSON is the normal path.
    }

    return trimmed
      .replace(/^["']|["']$/g, '')
      .replace(/^(title|tiêu đề|tieu de)\s*:\s*/i, '')
      .trim();
  }

  private cleanAiDescription(content: string): string {
    const trimmed = content
      .trim()
      .replace(/^```(?:text)?\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(trimmed) as {
        description?: unknown;
        content?: unknown;
      };
      if (typeof parsed.description === 'string') {
        return this.cleanDescriptionText(parsed.description);
      }
      if (typeof parsed.content === 'string') {
        return this.cleanDescriptionText(parsed.content);
      }
    } catch {
      // The prompt asks for plain text, so non-JSON is the normal path.
    }

    return this.cleanDescriptionText(trimmed);
  }

  private cleanDescriptionText(text: string): string {
    return this.removeAssignmentMentions(text)
      .replace(/\*([^*\n]+)\*/g, '$1')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => !/^(bug report|title|tiêu đề|tieu de)\s*:/i.test(line))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private requireTitle(value: unknown): string {
    if (typeof value !== 'string') {
      throw new Error('AI parser did not return a valid title');
    }

    const title = value.trim().slice(0, 255);
    if (this.isInvalidTitle(title)) {
      throw new Error(`AI parser returned an invalid title: ${title}`);
    }
    if (title.length > 120) {
      throw new Error(`AI parser returned a title that is too long: ${title}`);
    }
    if (!title) {
      throw new Error('AI parser returned an empty title');
    }
    return title;
  }

  private isInvalidTitle(title: string): boolean {
    return /^(steps?|actual|expected|severity|environment|device|module|priority)\s*:?\s*/i.test(
      title,
    );
  }

  private titleWithPlatformPrefix(title: string, sourceText: string): string {
    if (/^\[(app|web|app\/web)\]\s*/i.test(title)) {
      return title;
    }

    return `${this.platformPrefix(sourceText)} ${title}`.trim();
  }

  private platformPrefix(sourceText: string): '[App]' | '[Web]' | '[App/Web]' {
    const text = sourceText.toLowerCase();
    const hasApp =
      /\b(app|mobile|android|ios|iphone|ipad)\b/i.test(text) ||
      text.includes('ứng dụng') ||
      text.includes('ung dung');
    const hasWeb =
      /\b(web|website|browser|chrome|safari|firefox|edge)\b/i.test(text) ||
      text.includes('trình duyệt') ||
      text.includes('trinh duyet');

    if (hasApp && hasWeb) {
      return '[App/Web]';
    }
    if (hasWeb) {
      return '[Web]';
    }
    return '[App]';
  }

  private cleanError(error: unknown): string {
    if (this.isAxiosError(error)) {
      const responseData = error.response?.data;
      if (responseData && typeof responseData === 'object') {
        const data = responseData as {
          error?: string | { message?: string; metadata?: { raw?: string } };
        };
        if (typeof data.error === 'string') {
          return data.error;
        }
        if (data.error?.metadata?.raw) {
          return data.error.metadata.raw;
        }
        if (data.error?.message) {
          return data.error.message;
        }
      }

      if (typeof responseData === 'string' && responseData.trim()) {
        return responseData.trim().slice(0, 500);
      }

      if (error.response?.status) {
        return `HTTP ${error.response.status}`;
      }
    }

    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private isAxiosError(error: unknown): error is {
    response?: {
      status?: number;
      data?: unknown;
    };
  } {
    return typeof error === 'object' && error !== null && 'response' in error;
  }
}
