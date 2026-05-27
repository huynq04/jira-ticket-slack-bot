# jira-ticket-bot-service

Production-ready MVP NestJS service that creates Jira Server/Data Center issues from Slack bug reports.

## Features

- Slack slash command: `/create-ticket-jira`
- Slack message shortcut / interactive action: `Create Jira Ticket`
- Internal API: `POST /internal/tickets/create-from-message`
- Jira Server/Data Center REST API v2 integration
- PostgreSQL persistence through Prisma
- Duplicate prevention per Slack message
- Audit logging for success, duplicate, and failure paths
- Slack HMAC signature verification using raw request body

## Run Locally

```bash
npm install
cp .env.example .env
docker compose up -d postgres
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

The service listens on `PORT`, default `3000`.

## Environment

Configure `.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/jira_ticket_bot
JIRA_BASE_URL=https://jira.company.com
JIRA_AUTH_TYPE=BEARER
JIRA_TOKEN=change-me
SLACK_SIGNING_SECRET=change-me
SLACK_BOT_TOKEN=xoxb-change-me
INTERNAL_API_TOKEN=change-me
```

For basic auth, set:

```env
JIRA_AUTH_TYPE=BASIC
JIRA_USERNAME=your.username
JIRA_PASSWORD=your.password
```

## Jira Self-Hosted Configuration

This service uses Jira REST API v2:

- Create issue: `POST /rest/api/2/issue`
- Attachments: `POST /rest/api/2/issue/{issueKey}/attachments`
- Browse URL: `${JIRA_BASE_URL}/browse/{issueKey}`

Default Jira values are controlled by:

- `JIRA_DEFAULT_PROJECT`
- `JIRA_DEFAULT_ISSUE_TYPE`
- `JIRA_DEFAULT_PRIORITY`

Channel-specific project defaults can be inserted into `JiraProjectConfig`.

## Slack Slash Command

Create a Slack slash command:

- Command: `/create-ticket-jira`
- Request URL: `https://your-service/slack/commands`
- Method: `POST`

Recommended bot token scopes:

- `chat:write`
- `users:read`
- `users:read.email`

Example command:

```text
/create-ticket-jira project=APP type=Bug priority=High assignee=@Tester
[BUG] Không nhận được OTP khi đăng nhập
Module: Login
Environment: UAT
Steps:
1. Mở app
2. Nhập số điện thoại
Actual:
Không nhận được OTP
Expected:
Nhận được OTP trong vòng 60 giây
Severity: High
```

When `assignee` is a Slack mention, Slack sends it as `<@U...>`. The service resolves it through `users.info`, reads the Slack email, searches Jira users by the same email, and sends Jira the resolved username.

## Slack Message Shortcut

Create a Slack message shortcut:

- Name: `Create Jira Ticket`
- Callback ID: `create_jira_ticket`
- Request URL: `https://your-service/slack/interactions`

The service reads the selected message text and sends it through the same ticket creation core flow.

## Internal API Example

```bash
curl -X POST http://localhost:3000/internal/tickets/create-from-message \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "source": {
      "platform": "SLACK",
      "workspaceId": "T123",
      "channelId": "C123",
      "messageId": "1710000000.123456",
      "messageUrl": "https://company.slack.com/archives/C123/p1710000000123456"
    },
    "sender": {
      "platformUserId": "U123",
      "displayName": "Tester A",
      "email": "tester@company.com"
    },
    "command": {
      "rawText": "/create-ticket-jira project=APP priority=High",
      "projectKey": "APP",
      "issueType": "Bug",
      "priority": "High",
      "assignee": "hung.nq"
    },
    "message": {
      "content": "[BUG] Không nhận được OTP khi đăng nhập\nModule: Login\nEnvironment: UAT\nSteps:\n1. Mở app\n2. Nhập số điện thoại\n3. Bấm Đăng nhập\nActual:\nKhông nhận được OTP\nExpected:\nNhận được OTP trong vòng 60 giây\nSeverity: High",
      "attachments": []
    }
  }'
```

## Development Scripts

```bash
npm run start:dev
npm run build
npm run test
npm run lint
npm run prisma:generate
npm run prisma:migrate
```

## Known Limitations

- Slack file download is not implemented in this MVP. The Jira attachment service and client method exist, and uploads work when a buffer is supplied internally. Slack attachment download should be added before relying on Slack files in production.
- Slash command invocations do not have a stable original Slack message timestamp. The MVP uses Slack request metadata as the source ID for slash commands; message shortcuts provide the selected message timestamp and are the preferred duplicate-safe path.
- Project permission checks are represented by the core service boundary and project config lookup. Add organization-specific Slack user to Jira permission rules before production rollout.
