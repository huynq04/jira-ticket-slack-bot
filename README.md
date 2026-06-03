# jira-ticket-bot-service

NestJS service that creates Jira tickets from a Slack Message Shortcut.

## Features

- Slack Message Shortcut: `Create Jira Ticket`
- No slash command and no Slack modal in the active flow
- Slack request signature verification with raw request body
- Channel to Jira project mapping through Prisma/PostgreSQL
- Optional Slack user to Jira `accountId` mapping
- Groq AI title generation for free-form bug messages
- Jira Cloud API v3 support with ADF descriptions
- Clean Jira descriptions from Slack message content
- Slack file download and Jira attachment upload
- Duplicate prevention per Slack message
- Slack thread replies for success and error responses

## Tester Guide

For tester-facing usage instructions, see [TESTER_GUIDE.md](./TESTER_GUIDE.md).

## Run Locally

```bash
npm install
docker compose up -d postgres
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

The service listens on `PORT`, default `3000`.

## Ngrok With Docker

Reserve a static domain in the ngrok dashboard, then add the authtoken and domain to `.env`:

```env
NGROK_AUTHTOKEN=change-me
NGROK_DOMAIN=your-static-domain.ngrok-free.app
```

Set `NGROK_DOMAIN` to the hostname only. Do not include `https://` or a trailing `/`.

Keep the NestJS app running on your machine:

```bash
npm run start:dev
```

Start the ngrok container:

```bash
docker compose --profile tunnel up -d ngrok
```

View the public HTTPS URL. It should match `NGROK_DOMAIN`:

```bash
docker compose logs -f ngrok
```

Or open the ngrok inspector at:

```text
http://localhost:4040
```

Use this Slack Request URL:

```text
https://your-static-domain.ngrok-free.app/slack/interactions
```

## Environment

Configure `.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/jira_ticket_bot
NGROK_AUTHTOKEN=change-me
NGROK_DOMAIN=your-static-domain.ngrok-free.app
SLACK_SIGNING_SECRET=change-me
SLACK_BOT_TOKEN=xoxb-change-me
JIRA_BASE_URL=https://company.atlassian.net
JIRA_EMAIL=bot@company.com
JIRA_API_TOKEN=change-me
JIRA_API_VERSION=3
JIRA_DEFAULT_ISSUE_TYPE=Bug
JIRA_MAX_ATTACHMENT_SIZE_MB=50
INTERNAL_API_TOKEN=change-me
GROQ_API_KEY=change-me
GROQ_MODEL=llama-3.1-8b-instant
GROQ_FALLBACK_MODELS=qwen/qwen3-32b
```

Legacy Jira Server/Data Center auth is still supported through `JIRA_AUTH_TYPE`, `JIRA_TOKEN`, `JIRA_USERNAME`, and `JIRA_PASSWORD`, but the Message Shortcut flow is optimized for Jira Cloud v3.

## Database Mapping

Map Slack channels to Jira projects:

```sql
INSERT INTO slack_jira_project_mapping (
  id,
  slack_team_id,
  slack_channel_id,
  slack_channel_name,
  jira_project_key,
  default_issue_type
) VALUES (
  'mapping-laoid-bugs',
  'T123',
  'C123',
  'laoid-bugs',
  'LAOID',
  'Bug'
);
```

Map Slack assignees to Jira Cloud users:

```sql
INSERT INTO slack_jira_user_mapping (
  id,
  slack_user_id,
  slack_username,
  jira_account_id,
  jira_display_name
) VALUES (
  'mapping-hung',
  'U123',
  'hung',
  '712020:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  'Hung Nguyen'
);
```

If an assignee is not mapped, the ticket is still created without `assignee`, and the Slack thread reply includes a warning.

## Slack App Configuration

Enable Interactivity:

- Request URL: `https://your-service/slack/interactions`

Create a Message Shortcut:

- Name: `Create Jira Ticket`
- Callback ID: `create_jira_ticket_from_message`

Required bot scopes:

- `chat:write`
- `channels:history`
- `groups:history`
- `files:read`
- `users:read`

## Message Parsing

The bot first reads simple labels locally. If the message has `Title:` or `Tiêu đề:`, that value becomes the Jira summary. If there is no title label, the bot sends the Slack message content to Groq Chat Completions and asks the configured model to return a plain-text Jira title. `GROQ_API_KEY` is required when AI title or thread description generation is needed.

Default AI model:

```env
GROQ_MODEL=llama-3.1-8b-instant
GROQ_FALLBACK_MODELS=qwen/qwen3-32b
```

When a title must be generated, AI title generation must succeed before Jira issue creation starts. If Groq is unavailable, returns an empty title, or returns an invalid title, the bot replies with an error instead of creating a Jira ticket.

Supported message hints:

- `Title:` or `Tiêu đề:` sets the Jira summary directly.
- `Assignee:` / `Người xử lý:` or a free-form Slack/Jira mention like `<@U123>` / `@username` can be used as assignee.

Jira summaries are prefixed automatically with `[App]`, `[Web]`, or `[App/Web]` based on the message content.

The Jira assignee hint is parsed locally from the Slack message. If the Slack message has thread replies, the bot fetches tester replies, ignores bot messages, and asks Groq to compose a clean Jira description from the original message plus tester thread context. Without thread replies, Jira description uses the cleaned original message content, without Slack metadata, title, assignee, or attachment name lists.

## Local Test Flow

1. Start the service with `npm run start:dev`.
2. Expose it with a tunnel such as ngrok.
3. Set Slack Interactivity Request URL to `https://your-tunnel/slack/interactions`.
4. Insert a `slack_jira_project_mapping` row for the test channel.
5. In Slack, select a message, choose `More actions`, then `Create Jira Ticket`.

## Development Scripts

```bash
npm run build
npm run test
npm run prisma:generate
npm run prisma:migrate
```
