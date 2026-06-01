-- CreateTable
CREATE TABLE "slack_jira_project_mapping" (
    "id" TEXT NOT NULL,
    "slack_team_id" TEXT NOT NULL,
    "slack_channel_id" TEXT NOT NULL,
    "slack_channel_name" TEXT,
    "jira_project_key" TEXT NOT NULL,
    "default_issue_type" TEXT NOT NULL DEFAULT 'Bug',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slack_jira_project_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slack_jira_user_mapping" (
    "id" TEXT NOT NULL,
    "slack_user_id" TEXT,
    "slack_username" TEXT,
    "jira_account_id" TEXT NOT NULL,
    "jira_display_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slack_jira_user_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slack_jira_project_mapping_slack_team_id_slack_channel_id_key" ON "slack_jira_project_mapping"("slack_team_id", "slack_channel_id");

-- CreateIndex
CREATE INDEX "slack_jira_project_mapping_slack_team_id_slack_channel_id_is_active_idx" ON "slack_jira_project_mapping"("slack_team_id", "slack_channel_id", "is_active");

-- CreateIndex
CREATE INDEX "slack_jira_user_mapping_slack_user_id_is_active_idx" ON "slack_jira_user_mapping"("slack_user_id", "is_active");

-- CreateIndex
CREATE INDEX "slack_jira_user_mapping_slack_username_is_active_idx" ON "slack_jira_user_mapping"("slack_username", "is_active");
