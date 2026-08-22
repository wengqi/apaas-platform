-- CreateTable
CREATE TABLE "data_flows" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "api_name" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "outputColumns" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "datasets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "api_name" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source_flow_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EMPTY',
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "columns" JSONB NOT NULL DEFAULT '[]',
    "last_refreshed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_rows" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "dataset_id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dataset_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_flows_tenant_id_idx" ON "data_flows"("tenant_id");

-- CreateIndex
CREATE INDEX "data_flows_app_id_idx" ON "data_flows"("app_id");

-- CreateIndex
CREATE UNIQUE INDEX "data_flows_tenant_id_app_id_api_name_key" ON "data_flows"("tenant_id", "app_id", "api_name");

-- CreateIndex
CREATE INDEX "datasets_tenant_id_idx" ON "datasets"("tenant_id");

-- CreateIndex
CREATE INDEX "datasets_app_id_idx" ON "datasets"("app_id");

-- CreateIndex
CREATE UNIQUE INDEX "datasets_tenant_id_app_id_api_name_key" ON "datasets"("tenant_id", "app_id", "api_name");

-- CreateIndex
CREATE INDEX "dataset_rows_dataset_id_idx" ON "dataset_rows"("dataset_id");

-- CreateIndex
CREATE INDEX "dataset_rows_data_idx" ON "dataset_rows" USING GIN ("data");

-- AddForeignKey
ALTER TABLE "data_flows" ADD CONSTRAINT "data_flows_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_flows" ADD CONSTRAINT "data_flows_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_source_flow_id_fkey" FOREIGN KEY ("source_flow_id") REFERENCES "data_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_rows" ADD CONSTRAINT "dataset_rows_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
