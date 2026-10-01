-- DropIndex
DROP INDEX "auto_number_counters_object_id_prefix_key";

-- AlterTable
ALTER TABLE "auto_number_counters" ADD COLUMN     "environment_id" TEXT NOT NULL DEFAULT 'prod';

-- AlterTable
ALTER TABLE "node_executions" ADD COLUMN     "environment_id" TEXT NOT NULL DEFAULT 'prod';

-- AlterTable
ALTER TABLE "process_instances" ADD COLUMN     "environment_id" TEXT NOT NULL DEFAULT 'prod',
ADD COLUMN     "frozen_workflow_schema" JSONB;

-- AlterTable
ALTER TABLE "records" ADD COLUMN     "environment_id" TEXT NOT NULL DEFAULT 'prod';

-- CreateTable
CREATE TABLE "app_environments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "current_version_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "env_var_defs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "env_var_defs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "env_var_values" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "def_id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "env_var_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_environments_tenant_id_idx" ON "app_environments"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_environments_app_id_key_key" ON "app_environments"("app_id", "key");

-- CreateIndex
CREATE INDEX "deployments_environment_id_created_at_idx" ON "deployments"("environment_id", "created_at");

-- CreateIndex
CREATE INDEX "deployments_tenant_id_idx" ON "deployments"("tenant_id");

-- CreateIndex
CREATE INDEX "env_var_defs_tenant_id_idx" ON "env_var_defs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "env_var_defs_app_id_key_key" ON "env_var_defs"("app_id", "key");

-- CreateIndex
CREATE INDEX "env_var_values_tenant_id_idx" ON "env_var_values"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "env_var_values_environment_id_def_id_key" ON "env_var_values"("environment_id", "def_id");

-- CreateIndex
CREATE UNIQUE INDEX "auto_number_counters_object_id_prefix_environment_id_key" ON "auto_number_counters"("object_id", "prefix", "environment_id");

-- CreateIndex
CREATE INDEX "node_executions_environment_id_idx" ON "node_executions"("environment_id");

-- CreateIndex
CREATE INDEX "process_instances_environment_id_idx" ON "process_instances"("environment_id");

-- CreateIndex
CREATE INDEX "records_environment_id_idx" ON "records"("environment_id");

-- AddForeignKey
ALTER TABLE "app_environments" ADD CONSTRAINT "app_environments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_environments" ADD CONSTRAINT "app_environments_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "app_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "env_var_defs" ADD CONSTRAINT "env_var_defs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "env_var_defs" ADD CONSTRAINT "env_var_defs_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "env_var_values" ADD CONSTRAINT "env_var_values_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "env_var_values" ADD CONSTRAINT "env_var_values_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "app_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "env_var_values" ADD CONSTRAINT "env_var_values_def_id_fkey" FOREIGN KEY ("def_id") REFERENCES "env_var_defs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: 为存量应用创建 dev/prod 环境行（id 用确定性伪 cuid，TEXT 列无格式约束）
INSERT INTO "app_environments" ("id", "tenant_id", "app_id", "key", "created_at", "updated_at")
SELECT 'env_dev_' || md5(a."id"), a."tenant_id", a."id", 'dev', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "applications" a;
INSERT INTO "app_environments" ("id", "tenant_id", "app_id", "key", "created_at", "updated_at")
SELECT 'env_prod_' || md5(a."id"), a."tenant_id", a."id", 'prod', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "applications" a;
