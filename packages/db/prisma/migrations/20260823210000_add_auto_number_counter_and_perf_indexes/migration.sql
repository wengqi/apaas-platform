-- 自动编号计数器表（原子自增，替代全表扫描计数）
CREATE TABLE "auto_number_counters" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_number_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auto_number_counters_object_id_prefix_key" ON "auto_number_counters"("object_id", "prefix");

-- CreateIndex
CREATE INDEX "auto_number_counters_tenant_id_idx" ON "auto_number_counters"("tenant_id");

-- AddForeignKey
ALTER TABLE "auto_number_counters" ADD CONSTRAINT "auto_number_counters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 性能索引：权限/任务检查高频查询
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "org_members_org_id_idx" ON "org_members"("org_id");

-- CreateIndex
CREATE INDEX "process_tasks_instance_id_status_idx" ON "process_tasks"("instance_id", "status");

-- UniqueIndex：webhook token 唯一性（DB 级保障 + 查询加速；已确认无重复值）
CREATE UNIQUE INDEX "connectors_webhook_token_key" ON "connectors"("webhook_token");
