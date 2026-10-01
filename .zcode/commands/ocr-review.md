---
description: OCR 委托模式代码评审——当前分支待推变更全量审查，High/Medium 修复后复验
---

执行 OCR 委托模式代码评审（open-code-review-delegate skill），对象为当前分支相对 main 的全部待推变更：

1. `ocr delegate preview --from origin/main --to HEAD --format json` 确定审查范围（若与 main 已合并则退化为 `--commit HEAD`）。
2. `ocr delegate rule --format json <paths>` 获取规则组；逐文件取 diff（`git diff origin/main..HEAD -- <path>`）审查，覆盖率达到 100%（每个文件 reviewed 或带理由 skipped）。
3. 分级处理发现：
   - Critical/High：**必须修复**——当场修复并补对应单测/回归验证
   - Medium：默认修复；确属设计取舍的经用户确认后记录到知识库「明确不做」
   - Low：顺手修（改动 ≤5 行）或记录不修
4. 每项发现先复核再动手（给证据链，避免误报直接改代码）；修复后运行受影响包的单测 + typecheck + lint，涉及鉴权/租户隔离的必须补防御性单测。
5. 输出结构化报告（total/reviewed/skipped/coverage + 按严重度分组 findings），随后提交（`fix(...)`）并推送，按长期约定盯 CI 到全绿。

红线：不得为让评审通过而弱化测试；发现属体系性陷阱（如 TENANT_SCOPED_MODELS 漏配）须同步知识库踩坑节。
