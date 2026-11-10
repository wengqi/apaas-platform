-- PE-21（R-B 波次⑥，scale-04/R2-compat-06）：触发摘要投影列 + PE-23「我发起的」表达式索引
-- 投影列：触发节点绑定对象物化（三写点 PUT/发布/AI 落地同源 extractTriggerInfo 增量同步）
ALTER TABLE "process_definitions" ADD COLUMN "trigger_object_id" TEXT;

-- 存量回填（OCR 复审波次⑥：NULLIF 空串归 NULL 对齐 extractTriggerInfo 的
-- 非空字符串语义——空串 objectId 会落宽松 OR 两分支之外漏触；jsonb_typeof
-- array guard 防手写/历史 schema nodes 非数组炸迁移单事务）
UPDATE "process_definitions" pd
SET "trigger_type" = COALESCE(
      (SELECT NULLIF(n -> 'data' ->> 'triggerType', '')
       FROM jsonb_array_elements(pd."workflow_schema" -> 'nodes') n
       WHERE n ->> 'type' = 'trigger' LIMIT 1),
      pd."trigger_type"),
    "trigger_object_id" = (
      SELECT NULLIF(n -> 'data' ->> 'objectId', '')
      FROM jsonb_array_elements(pd."workflow_schema" -> 'nodes') n
      WHERE n ->> 'type' = 'trigger' LIMIT 1),
    "cron" = COALESCE(
      (SELECT NULLIF(n -> 'data' ->> 'cron', '')
       FROM jsonb_array_elements(pd."workflow_schema" -> 'nodes') n
       WHERE n ->> 'type' = 'trigger' LIMIT 1),
      pd."cron")
WHERE jsonb_typeof(pd."workflow_schema" -> 'nodes') = 'array'
  AND EXISTS (
  SELECT 1 FROM jsonb_array_elements(pd."workflow_schema" -> 'nodes') n
  WHERE n ->> 'type' = 'trigger' AND NULLIF(n -> 'data' ->> 'triggerType', '') IS NOT NULL);

-- PE-23（scale-08）：「我发起的」triggerContext JSONB path 过滤表达式索引
-- （运行时门户常规入口 Seq Scan ×2 → 索引扫描）
CREATE INDEX "process_instances_triggered_by_user_idx"
  ON "process_instances" (("trigger_context" ->> 'triggeredByUser'));
