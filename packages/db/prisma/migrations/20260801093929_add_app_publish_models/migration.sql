-- CreateEnum
CREATE TYPE "AppVersionStatus" AS ENUM ('PUBLISHED', 'ROLLED_BACK');

-- CreateTable
CREATE TABLE "app_versions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "versionNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changeSet" JSONB,
    "status" "AppVersionStatus" NOT NULL DEFAULT 'PUBLISHED',
    "published_by" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "entity_name" TEXT,
    "changeType" TEXT NOT NULL,
    "changed_by" TEXT NOT NULL,
    "change_description" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_checks" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "issues" JSONB,
    "checked_by" TEXT NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_versions_tenant_id_idx" ON "app_versions"("tenant_id");

-- CreateIndex
CREATE INDEX "app_versions_app_id_idx" ON "app_versions"("app_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_versions_app_id_versionNumber_key" ON "app_versions"("app_id", "versionNumber");

-- CreateIndex
CREATE INDEX "change_logs_tenant_id_idx" ON "change_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "change_logs_app_id_idx" ON "change_logs"("app_id");

-- CreateIndex
CREATE INDEX "change_logs_app_id_module_idx" ON "change_logs"("app_id", "module");

-- CreateIndex
CREATE INDEX "app_checks_tenant_id_idx" ON "app_checks"("tenant_id");

-- CreateIndex
CREATE INDEX "app_checks_app_id_idx" ON "app_checks"("app_id");

-- AddForeignKey
ALTER TABLE "app_versions" ADD CONSTRAINT "app_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_versions" ADD CONSTRAINT "app_versions_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_logs" ADD CONSTRAINT "change_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_logs" ADD CONSTRAINT "change_logs_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_checks" ADD CONSTRAINT "app_checks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_checks" ADD CONSTRAINT "app_checks_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
