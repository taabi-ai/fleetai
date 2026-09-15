-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT,
    "aiPin" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Dashboard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "cloneCount" INTEGER NOT NULL DEFAULT 0,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Widget" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "widgetConfig" JSONB NOT NULL,
    "gridPos" JSONB NOT NULL,
    "lockedById" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Widget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryWidget" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "widgetConfig" JSONB NOT NULL,
    "gridPos" JSONB NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryWidget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardShare" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sharedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DashboardShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpServer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "authToken" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'openai',
    "baseUrl" TEXT NOT NULL,
    "apiKey" TEXT,
    "model" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LlmProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmtpSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 587,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT,
    "password" TEXT,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "replyTo" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmtpSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "icon" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isExternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "IntegrationSetting" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "DoraEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "service" TEXT NOT NULL DEFAULT 'fleetai-dash',
    "env" TEXT NOT NULL DEFAULT 'production',
    "status" TEXT NOT NULL DEFAULT 'success',
    "ref" TEXT,
    "incidentId" TEXT,
    "leadTimeMin" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoraEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "method" TEXT,
    "path" TEXT,
    "status" INTEGER,
    "ip" TEXT,
    "userAgent" TEXT,
    "payload" JSONB,
    "result" JSONB,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT,
    "providerName" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "feature" TEXT NOT NULL DEFAULT 'generate',
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimated" BOOLEAN NOT NULL DEFAULT false,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserQuota" (
    "userId" TEXT NOT NULL,
    "monthlyLimit" INTEGER,
    "bonusTokens" INTEGER NOT NULL DEFAULT 0,
    "bonusMonth" TEXT,
    "hardLimit" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserQuota_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CreditRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "EnvVar" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnvVar_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'document',
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "cloud_storage_path" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "folder" TEXT NOT NULL DEFAULT 'general',
    "durationSec" INTEGER,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingModule" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "audience" TEXT NOT NULL DEFAULT 'customer',
    "level" TEXT NOT NULL DEFAULT 'beginner',
    "order" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "coverAssetId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingLesson" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "videoAssetId" TEXT,
    "videoUrl" TEXT,
    "durationSec" INTEGER,
    "chapters" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "positionSec" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "safetyScore" INTEGER NOT NULL DEFAULT 80,
    "trips" INTEGER NOT NULL DEFAULT 0,
    "violations" INTEGER NOT NULL DEFAULT 0,
    "onTimeRate" INTEGER NOT NULL DEFAULT 90,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "fromCity" TEXT NOT NULL,
    "toCity" TEXT NOT NULL,
    "distanceKm" INTEGER NOT NULL,
    "avgTimeHours" INTEGER NOT NULL DEFAULT 0,
    "tripCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "isEv" BOOLEAN NOT NULL DEFAULT false,
    "fuelLevel" INTEGER NOT NULL DEFAULT 0,
    "speed" INTEGER NOT NULL DEFAULT 0,
    "efficiency" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalFuelL" INTEGER NOT NULL DEFAULT 0,
    "soc" INTEGER,
    "rangeKm" INTEGER,
    "evDistanceKm" INTEGER,
    "evEnergyKwh" INTEGER,
    "driverName" TEXT,
    "cityName" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "vehicleCode" TEXT,
    "driverName" TEXT,
    "routeLabel" TEXT,
    "carrier" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "costInr" INTEGER NOT NULL DEFAULT 0,
    "deliveryHours" INTEGER,
    "onTime" BOOLEAN NOT NULL DEFAULT true,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdasEvent" (
    "id" TEXT NOT NULL,
    "vehicleCode" TEXT,
    "driverName" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdasEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargingSession" (
    "id" TEXT NOT NULL,
    "vehicleCode" TEXT NOT NULL,
    "depot" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "energyKwh" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChargingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetAlert" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "vehicleCode" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT,
    "cityName" TEXT,
    "dropPct" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FleetAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyStat" (
    "id" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "utilizationPct" INTEGER NOT NULL DEFAULT 0,
    "fuelConsumptionL" INTEGER NOT NULL DEFAULT 0,
    "fuelIdleHours" INTEGER NOT NULL DEFAULT 0,
    "fuelWasteL" INTEGER NOT NULL DEFAULT 0,
    "avgFuelLevel" INTEGER NOT NULL DEFAULT 0,
    "onTimeRate" INTEGER NOT NULL DEFAULT 0,
    "avgDeliveryHours" INTEGER NOT NULL DEFAULT 0,
    "tmsCompleted" INTEGER NOT NULL DEFAULT 0,
    "tmsPending" INTEGER NOT NULL DEFAULT 0,
    "adasHarshBraking" INTEGER NOT NULL DEFAULT 0,
    "adasLaneDeparture" INTEGER NOT NULL DEFAULT 0,
    "adasCollisionWarning" INTEGER NOT NULL DEFAULT 0,
    "adasSpeeding" INTEGER NOT NULL DEFAULT 0,
    "adasFatigue" INTEGER NOT NULL DEFAULT 0,
    "safetyScore" INTEGER NOT NULL DEFAULT 0,
    "avgSoc" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Dashboard_userId_idx" ON "Dashboard"("userId");

-- CreateIndex
CREATE INDEX "Dashboard_isPublished_idx" ON "Dashboard"("isPublished");

-- CreateIndex
CREATE INDEX "Widget_dashboardId_idx" ON "Widget"("dashboardId");

-- CreateIndex
CREATE INDEX "LibraryWidget_ownerId_idx" ON "LibraryWidget"("ownerId");

-- CreateIndex
CREATE INDEX "DashboardShare_userId_idx" ON "DashboardShare"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardShare_dashboardId_userId_key" ON "DashboardShare"("dashboardId", "userId");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "DoraEvent_type_occurredAt_idx" ON "DoraEvent"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "DoraEvent_service_env_occurredAt_idx" ON "DoraEvent"("service", "env", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "LlmUsage_userId_createdAt_idx" ON "LlmUsage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LlmUsage_createdAt_idx" ON "LlmUsage"("createdAt");

-- CreateIndex
CREATE INDEX "CreditRequest_status_createdAt_idx" ON "CreditRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CreditRequest_userId_createdAt_idx" ON "CreditRequest"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_cloud_storage_path_key" ON "MediaAsset"("cloud_storage_path");

-- CreateIndex
CREATE INDEX "MediaAsset_kind_createdAt_idx" ON "MediaAsset"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_folder_idx" ON "MediaAsset"("folder");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingModule_slug_key" ON "TrainingModule"("slug");

-- CreateIndex
CREATE INDEX "TrainingLesson_moduleId_order_idx" ON "TrainingLesson"("moduleId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingProgress_userId_lessonId_key" ON "TrainingProgress"("userId", "lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_name_key" ON "Driver"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Route_fromCity_toCity_key" ON "Route"("fromCity", "toCity");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_code_key" ON "Vehicle"("code");

-- CreateIndex
CREATE INDEX "Vehicle_status_idx" ON "Vehicle"("status");

-- CreateIndex
CREATE INDEX "Vehicle_type_idx" ON "Vehicle"("type");

-- CreateIndex
CREATE INDEX "Vehicle_isEv_idx" ON "Vehicle"("isEv");

-- CreateIndex
CREATE INDEX "Trip_status_idx" ON "Trip"("status");

-- CreateIndex
CREATE INDEX "Trip_region_idx" ON "Trip"("region");

-- CreateIndex
CREATE INDEX "Trip_carrier_idx" ON "Trip"("carrier");

-- CreateIndex
CREATE INDEX "Trip_occurredAt_idx" ON "Trip"("occurredAt");

-- CreateIndex
CREATE INDEX "AdasEvent_type_idx" ON "AdasEvent"("type");

-- CreateIndex
CREATE INDEX "AdasEvent_driverName_idx" ON "AdasEvent"("driverName");

-- CreateIndex
CREATE INDEX "AdasEvent_severity_idx" ON "AdasEvent"("severity");

-- CreateIndex
CREATE INDEX "ChargingSession_startTime_idx" ON "ChargingSession"("startTime");

-- CreateIndex
CREATE INDEX "FleetAlert_type_idx" ON "FleetAlert"("type");

-- CreateIndex
CREATE INDEX "FleetAlert_occurredAt_idx" ON "FleetAlert"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStat_day_key" ON "DailyStat"("day");

-- CreateIndex
CREATE INDEX "DailyStat_day_idx" ON "DailyStat"("day");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dashboard" ADD CONSTRAINT "Dashboard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Widget" ADD CONSTRAINT "Widget_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Widget" ADD CONSTRAINT "Widget_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryWidget" ADD CONSTRAINT "LibraryWidget_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardShare" ADD CONSTRAINT "DashboardShare_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardShare" ADD CONSTRAINT "DashboardShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardShare" ADD CONSTRAINT "DashboardShare_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingLesson" ADD CONSTRAINT "TrainingLesson_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "TrainingModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingProgress" ADD CONSTRAINT "TrainingProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "TrainingLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

