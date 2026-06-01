-- AlterTable
ALTER TABLE "slack_jira_project_mapping" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "slack_jira_user_mapping" ALTER COLUMN "updated_at" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "slack_jira_project_mapping_slack_team_id_slack_channel_id_is_ac" RENAME TO "slack_jira_project_mapping_slack_team_id_slack_channel_id_i_idx";
