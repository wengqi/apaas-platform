-- E2-4 飞书式保存点历史：page_save_points 表
-- 每次 Schema 保存自动快照（保留最近 50 条），恢复操作亦产生回滚点

-- CreateTable
CREATE TABLE "page_save_points" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "schema" JSONB NOT NULL DEFAULT '{}',
    "source" TEXT NOT NULL DEFAULT 'save',
    "created_by" TEXT NOT NULL DEFAULT 'system',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_save_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_save_points_tenant_id_idx" ON "page_save_points"("tenant_id");

-- CreateIndex
CREATE INDEX "page_save_points_page_id_created_at_idx" ON "page_save_points"("page_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "page_save_points" ADD CONSTRAINT "page_save_points_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_save_points" ADD CONSTRAINT "page_save_points_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "page_metas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
