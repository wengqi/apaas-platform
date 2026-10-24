-- AlterTable
ALTER TABLE "connectors" ADD COLUMN     "process_def_id" TEXT;

-- AddForeignKey
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_process_def_id_fkey" FOREIGN KEY ("process_def_id") REFERENCES "process_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- P1-16 存量回填（幂等）：webhookToken 连接器 → 应用下唯一 WEBHOOK 已发布流程时自动绑定。
-- 多个 WEBHOOK 流程的应用不回填（无法判定意图，交由搭建者在连接器配置中显式绑定）。
UPDATE "connectors" c
SET "process_def_id" = p.id
FROM "process_definitions" p
WHERE c."webhook_token" IS NOT NULL
  AND p."app_id" = c."app_id"
  AND p."trigger_type" = 'WEBHOOK'
  AND p."status" = 'PUBLISHED'
  AND (
    SELECT COUNT(*) FROM "process_definitions" p2
    WHERE p2."app_id" = c."app_id"
      AND p2."trigger_type" = 'WEBHOOK'
      AND p2."status" = 'PUBLISHED'
  ) = 1
  AND c."process_def_id" IS NULL;
