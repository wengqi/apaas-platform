-- CreateTable
CREATE TABLE "connectors" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "api_name" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "base_url" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "credential_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "webhook_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connector_credentials" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connector_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "connectors_tenant_id_idx" ON "connectors"("tenant_id");

-- CreateIndex
CREATE INDEX "connectors_app_id_idx" ON "connectors"("app_id");

-- CreateIndex
CREATE UNIQUE INDEX "connectors_tenant_id_app_id_api_name_key" ON "connectors"("tenant_id", "app_id", "api_name");

-- CreateIndex
CREATE INDEX "connector_credentials_tenant_id_idx" ON "connector_credentials"("tenant_id");

-- CreateIndex
CREATE INDEX "connector_credentials_app_id_idx" ON "connector_credentials"("app_id");

-- CreateIndex
CREATE UNIQUE INDEX "connector_credentials_tenant_id_app_id_name_key" ON "connector_credentials"("tenant_id", "app_id", "name");

-- AddForeignKey
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "connector_credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_credentials" ADD CONSTRAINT "connector_credentials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_credentials" ADD CONSTRAINT "connector_credentials_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
