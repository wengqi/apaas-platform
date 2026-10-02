-- R1.7 第二轮前置：删除 Application.publishedSnapshot 旧快照列。
-- 运行时唯一读路径 = AppEnvironment 指针 → AppVersion.snapshot（不可变 bundle）。
-- 旧快照（published_snapshot）是 R1.4 之前的存量兼容路径，平台未上线、无存量部署，
-- 兜底腿随 v1 运行时轨一并退役（seed 已改为创建 AppVersion + 环境指针 + Deployment）。
ALTER TABLE "applications" DROP COLUMN "published_snapshot";
