import { Injectable } from '@nestjs/common';
import { JiraProjectConfigResult } from '../project-config/jira-project-config.service';
import { ParsedBugDto } from '../ticket/dto/parsed-bug.dto';

export interface JiraCreateIssuePayload {
  fields: Record<string, unknown>;
}

@Injectable()
export class JiraFieldMapperService {
  mapToCreateIssuePayload(input: {
    parsedBug: ParsedBugDto;
    config: JiraProjectConfigResult;
    sourceUrl?: string;
    command?: { issueType?: string; priority?: string; assignee?: string };
  }): JiraCreateIssuePayload {
    const { parsedBug, config, command } = input;
    const priority =
      command?.priority ??
      this.mapSeverity(parsedBug.severity, config) ??
      config.defaultPriority;
    const issueType = command?.issueType ?? config.defaultIssueType;
    const assignee = command?.assignee ?? config.defaultAssignee;
    const fields: Record<string, unknown> = {
      project: { key: config.projectKey },
      summary: this.withModulePrefix(parsedBug.summary, parsedBug.module),
      description: this.buildDescription(parsedBug, input.sourceUrl),
      issuetype: { name: issueType },
      priority: { name: priority },
    };

    if (assignee) {
      fields.assignee = { name: assignee };
    }

    const component = parsedBug.module
      ? config.componentMapping[parsedBug.module]
      : undefined;
    if (component) {
      fields.components = [{ name: component }];
    }

    return { fields };
  }

  private mapSeverity(
    severity: string | undefined,
    config: JiraProjectConfigResult,
  ): string | undefined {
    if (!severity) {
      return undefined;
    }
    return (
      config.severityPriorityMapping[severity] ??
      config.severityPriorityMapping[severity.toLowerCase()] ??
      severity
    );
  }

  private withModulePrefix(summary: string, module?: string): string {
    if (!module || summary.startsWith(`[${module}]`)) {
      return summary;
    }
    return `[${module}] ${summary}`;
  }

  private buildDescription(
    parsedBug: ParsedBugDto,
    sourceUrl?: string,
  ): string {
    const sections: string[] = [];
    if (parsedBug.module) {
      sections.push(`Module: ${parsedBug.module}`);
    }
    if (parsedBug.environment) {
      sections.push(`Environment: ${parsedBug.environment}`);
    }
    if (parsedBug.device) {
      sections.push(`Device: ${parsedBug.device}`);
    }
    if (parsedBug.accountTest) {
      sections.push(`Account test: ${parsedBug.accountTest}`);
    }
    if (parsedBug.steps.length) {
      sections.push(
        `Steps:\n${parsedBug.steps
          .map((step, index) => `${index + 1}. ${step}`)
          .join('\n')}`,
      );
    }
    if (parsedBug.actualResult) {
      sections.push(`Actual:\n${parsedBug.actualResult}`);
    }
    if (parsedBug.expectedResult) {
      sections.push(`Expected:\n${parsedBug.expectedResult}`);
    }
    if (parsedBug.severity) {
      sections.push(`Severity: ${parsedBug.severity}`);
    }
    if (sourceUrl) {
      sections.push(`Source: ${sourceUrl}`);
    }
    return sections.join('\n\n');
  }
}
