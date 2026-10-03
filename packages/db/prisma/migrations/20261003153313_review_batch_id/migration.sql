-- AlterTable
ALTER TABLE "resource_versions" ADD COLUMN     "batch_id" TEXT;

-- CreateIndex
CREATE INDEX "resource_versions_app_id_batch_id_idx" ON "resource_versions"("app_id", "batch_id");
