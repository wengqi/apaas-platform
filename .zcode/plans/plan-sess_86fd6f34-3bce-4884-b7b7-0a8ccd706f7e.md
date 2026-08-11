# 彻底修复条件分支同步问题

## 当前状态分析

经过专家级代码审查，`getBranchBlocks` 函数和两处调用点的代码逻辑是正确的：
- `getBranchBlocks` 通过 `flowNodeType === 'inlineBlocks'` 查找 `$inlineBlocks$` 子节点
- flowgram 源码确认 `inlineBlocks` 节点的 `type` 和 `flowNodeType` 都是 `"inlineBlocks"`
- `addBlock` 确认分支 block 添加为 `$inlineBlocks$` 的子节点

## 可能的遗漏问题

需要验证：
1. Docker 构建是否包含了最新代码（`getBranchBlocks` 是否在构建产物中）
2. `flowNodeType` 可能在某些情况下不是 `"inlineBlocks"`（例如 fixed-layout-core 注册了 `mainInlineBlocks` / `catchInlineBlocks` 子类型）
3. `conditionNode.blocks` 可能在节点刚创建时还未包含 `$inlineBlocks$` 子节点

## 执行计划

1. 验证 Docker 构建产物包含 `getBranchBlocks`
2. 添加更健壮的 `inlineBlocks` 查找逻辑（兼容 `mainInlineBlocks` / `catchInlineBlocks` 子类型）
3. 在 `getBranchBlocks` 中增加 fallback：如果找不到 `inlineBlocks` 子节点，尝试通过 ID `$inlineBlocks$` + `conditionNode.id` 直接查找
4. 重建 Docker 并在浏览器中完整测试添加/删除分支的双向同步
