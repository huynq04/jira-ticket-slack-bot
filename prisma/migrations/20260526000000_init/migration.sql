CREATE TABLE "JiraTicketMapping" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "messageUrl" TEXT,
    "messageHash" TEXT NOT NULL,
    "jiraIssueKey" TEXT NOT NULL,
    "jiraIssueUrl" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,

    CONSTRAINT "JiraTicketMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JiraProjectConfig" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT,
    "jiraProjectKey" TEXT NOT NULL,
    "defaultIssueType" TEXT NOT NULL,
    "defaultPriority" TEXT NOT NULL,
    "defaultAssignee" TEXT,
    "componentMapping" JSONB,
    "severityPriorityMapping" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JiraProjectConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JiraTicketAuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "platform" TEXT,
    "channelId" TEXT,
    "messageId" TEXT,
    "jiraIssueKey" TEXT,
    "actor" TEXT,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JiraTicketAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JiraTicketMapping_platform_workspaceId_channelId_messageId_key" ON "JiraTicketMapping"("platform", "workspaceId", "channelId", "messageId");
CREATE INDEX "JiraTicketMapping_messageHash_idx" ON "JiraTicketMapping"("messageHash");
CREATE INDEX "JiraProjectConfig_platform_workspaceId_channelId_jiraProjectKey_active_idx" ON "JiraProjectConfig"("platform", "workspaceId", "channelId", "jiraProjectKey", "active");
CREATE INDEX "JiraTicketAuditLog_action_idx" ON "JiraTicketAuditLog"("action");
CREATE INDEX "JiraTicketAuditLog_platform_channelId_messageId_idx" ON "JiraTicketAuditLog"("platform", "channelId", "messageId");
