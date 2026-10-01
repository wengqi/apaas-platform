-- CreateEnum
CREATE TYPE "ServiceIdentityStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "ProcessApiReleaseStatus" AS ENUM ('ACTIVE', 'DEPRECATED');

-- CreateTable
CREATE TABLE "service_identities" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "app_id" TEXT,
    "name" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "status" "ServiceIdentityStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_used_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "process_api_releases" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "process_def_id" TEXT NOT NULL,
    "apiName" TEXT NOT NULL,
    "major_version" INTEGER NOT NULL,
    "workflowSchema" JSONB NOT NULL,
    "trigger_type" TEXT NOT NULL,
    "status" "ProcessApiReleaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "released_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "process_api_releases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_identities_key_hash_key" ON "service_identities"("key_hash");

-- CreateIndex
CREATE INDEX "service_identities_tenant_id_idx" ON "service_identities"("tenant_id");

-- CreateIndex
CREATE INDEX "process_api_releases_tenant_id_idx" ON "process_api_releases"("tenant_id");

-- CreateIndex
CREATE INDEX "process_api_releases_app_id_apiName_idx" ON "process_api_releases"("app_id", "apiName");

-- CreateIndex
CREATE UNIQUE INDEX "process_api_releases_app_id_apiName_major_version_key" ON "process_api_releases"("app_id", "apiName", "major_version");

-- AddForeignKey
ALTER TABLE "service_identities" ADD CONSTRAINT "service_identities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_api_releases" ADD CONSTRAINT "process_api_releases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_api_releases" ADD CONSTRAINT "process_api_releases_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

