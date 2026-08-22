-- CreateTable
CREATE TABLE "cloud_functions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "api_name" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "code" JSONB NOT NULL DEFAULT '{"source":"","language":"javascript"}',
    "inputSchema" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cloud_functions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cloud_functions_tenant_id_idx" ON "cloud_functions"("tenant_id");

-- CreateIndex
CREATE INDEX "cloud_functions_app_id_idx" ON "cloud_functions"("app_id");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_functions_tenant_id_app_id_api_name_key" ON "cloud_functions"("tenant_id", "app_id", "api_name");

-- AddForeignKey
ALTER TABLE "cloud_functions" ADD CONSTRAINT "cloud_functions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_functions" ADD CONSTRAINT "cloud_functions_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_functions" ADD CONSTRAINT "cloud_functions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
