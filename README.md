# jira-ticket-bot-service

NestJS service that creates Jira tickets from a Slack Message Shortcut.

## Features

- Slack Message Shortcut: `Create Jira Ticket`
- No slash command and no Slack modal in the active flow
- Slack request signature verification with raw request body
- Channel to Jira project mapping through Prisma/PostgreSQL
- Optional Slack user to Jira `accountId` mapping
- Jira Cloud API v3 support with ADF descriptions
- Slack thread context in Jira description
- Slack file download and Jira attachment upload
- Duplicate prevention per Slack message
- Slack thread replies for success and error responses

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

- `Title:` or `Tiêu đề:` sets the Jira summary.
- Without a title label, the first non-empty message line becomes the summary.
- `Assignee:` or `Người xử lý:` is optional.
- Assignee values can be Slack mentions like `<@U123>`, `@username`, or plain text.

The Jira description includes Slack source, channel, shortcut user, original message link, bug content, thread context, and attachment list.

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
