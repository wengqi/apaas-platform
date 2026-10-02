-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "trace_id" TEXT;

-- AlterTable
ALTER TABLE "process_instances" ADD COLUMN     "timed_out" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "observability_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL DEFAULT 'prod',
    "app_id" TEXT,
    "category" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "source" TEXT NOT NULL,
    "resource_id" TEXT,
    "duration_ms" INTEGER,
    "message" TEXT NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "trace_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observability_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "observability_events_tenant_id_category_created_at_idx" ON "observability_events"("tenant_id", "category", "created_at");

-- CreateIndex
CREATE INDEX "observability_events_tenant_id_app_id_idx" ON "observability_events"("tenant_id", "app_id");

-- CreateIndex
CREATE INDEX "observability_events_tenant_id_trace_id_idx" ON "observability_events"("tenant_id", "trace_id");

-- AddForeignKey
ALTER TABLE "observability_events" ADD CONSTRAINT "observability_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observability_events" ADD CONSTRAINT "observability_events_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
