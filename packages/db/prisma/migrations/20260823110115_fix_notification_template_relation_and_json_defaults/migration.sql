-- AlterTable
ALTER TABLE "app_versions" ALTER COLUMN "snapshot" SET DEFAULT '{}';

-- AlterTable
ALTER TABLE "connector_credentials" ALTER COLUMN "data" SET DEFAULT '{}';

-- AlterTable
ALTER TABLE "process_definitions" ALTER COLUMN "workflow_schema" SET DEFAULT '{}';

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
