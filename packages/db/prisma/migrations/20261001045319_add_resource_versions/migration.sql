-- CreateEnum
CREATE TYPE "ResourceVersionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ResourceVersionSource" AS ENUM ('HUMAN', 'AI_MCP');

-- CreateTable
CREATE TABLE "resource_versions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entity_id" TEXT,
    "apiName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "status" "ResourceVersionStatus" NOT NULL DEFAULT 'PENDING',
    "source" "ResourceVersionSource" NOT NULL DEFAULT 'HUMAN',
    "submitted_by" TEXT NOT NULL,
    "submitted_via" TEXT NOT NULL DEFAULT 'studio',
    "baseline_version_id" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resource_versions_tenant_id_idx" ON "resource_versions"("tenant_id");

-- CreateIndex
CREATE INDEX "resource_versions_app_id_module_entity_id_idx" ON "resource_versions"("app_id", "module", "entity_id");

-- CreateIndex
CREATE INDEX "resource_versions_app_id_status_idx" ON "resource_versions"("app_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "resource_versions_app_id_module_apiName_version_number_key" ON "resource_versions"("app_id", "module", "apiName", "version_number");

-- AddForeignKey
ALTER TABLE "resource_versions" ADD CONSTRAINT "resource_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_versions" ADD CONSTRAINT "resource_versions_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
