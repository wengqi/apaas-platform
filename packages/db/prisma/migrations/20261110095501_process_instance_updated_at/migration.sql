-- AlterTable
-- PE-12 孤儿实例 sweeper：最后活动信号（@updatedAt 自动刷新）
ALTER TABLE "process_instances" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 存量行按 UTC 回填（OCR 复审 2026-11-10）：CURRENT_TIMESTAMP 为 timestamptz，
-- 赋值给 timestamp 列时按数据库会话时区（docker-compose TZ=Asia/Shanghai）落成
-- UTC+8 墙钟值——比 Prisma（@updatedAt 走 UTC）写入的同一时刻快 8 小时，
-- sweeper 的 UTC 域比较在迁移后 ~8h 内漏检存量孤儿，显式按 UTC 回填纠正
UPDATE "process_instances" SET "updated_at" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- CreateIndex（sweeper 巡检查询：status=RUNNING + updatedAt < 阈值）
CREATE INDEX "process_instances_status_updated_at_idx" ON "process_instances"("status", "updated_at");

-- DropIndex（OCR 复审：复合索引最左前缀即 status，原单列索引冗余——
-- 高频更新表的写放大收敛）
DROP INDEX "process_instances_status_idx";
