# G5 数据下沉实现记录（2026-10-01）

> ROADMAP G5：「数据集引擎下沉 PostgreSQL SQL，删内存 join」。数据流 pipeline（加载→join→filter→聚合→输出映射）全量下推，Node 内存不再做 join 与聚合。

## 1. 架构变化

| 旧（内存引擎） | 新（SQL 下推） |
|---|---|
| 每源 `findMany` LIMIT 10k 拉入内存 | 每源 LIMIT 10k **子查询**（SQL 内） |
| JS hash join（右表 Map 桶） | `LEFT/INNER JOIN` + `COALESCE(data->>'f','')` 键规范化 |
| json-logic-js 逐行求值 | 可翻译子集 → `WHERE`；不可翻译非聚合分支保留 ~15 行内存求值兜底 |
| JS groupBy + metrics | `GROUP BY` 文本键 + regex 守卫 cast 指标（`SUM/COUNT/MAX/MIN`）+ `ROUND(numeric,2)` |
| `jsonb_object_agg` 无 | 右表字段经 LATERAL `jsonb_object_agg('<alias>_'||k, v)` 前缀合并（复刻 `alias_field` 键空间） |
| 结果数组 → 批量 createMany | 不变（物化事务 deleteMany→批量 createMany 原子换血保留） |

新增纯函数模块（SQL 构建与 Io 分离，可独立单测）：
- `dataset/jsonlogic-to-sql.ts`：JsonLogic 可翻译子集 → SQL 片段（字段键白名单防注入、值全参数绑定）
- `dataset/dataflow-sql.ts`：`buildPipelineSql(config, opts)` → `{text, values, filterPushedDown}`

## 2. 行为语义对齐表

| 语义 | 内存引擎 | SQL 复刻 | drift |
|---|---|---|---|
| join 键 | `String(v ?? '')` | `COALESCE(data->>'f','')` | JSON 数字文本表示（JS `String(1.0)='1'` vs PG `->>'1.0'`）极端场景可能分组不同 |
| left join 缺配 | 右字段 null | 无匹配 → `prefixed` 空对象 → 输出 COALESCE 落 null | 无 |
| filter == | JS 宽松相等 | 双侧文本行化；null 字面量 → `IS NULL`（缺失=null 对齐 JS null==undefined） | 无（常规标量） |
| filter >/< | JS 宽松（'abc'>5=false） | regex 守卫 cast，非数值→NULL→行过滤 | 'abc' <= 5 JS 为 true（保留），SQL 过滤 |
| sum/avg/max/min | `Number(v)` 非NaN 参与 | regex 守卫 cast，NULL 不参与 | 同 |
| 空组 avg/max/min | 0 | `COALESCE(...,0)` | 无 |
| count | 组行数 | `COUNT(*)` | 无 |
| 精度 | `Math.round(x*100)/100`（half-up） | `ROUND(numeric,2)`（half-away-from-zero） | .005 边界方向 |
| groupBy 输出值 | 首行原 JSON 值 | `(array_agg(data->'k'))[1]`（组内文本值相同） | 组内混合类型极端场景取值任意 |
| 每源上限 | findMany take 10k | 子查询 LIMIT 10k | LIMIT 无 ORDER——两侧同为不确定性取样 |
| preview total | 全量 pipeline 长度 | `COUNT(*) OVER ()`（LIMIT 前求值） | 无 |
| refresh 租约/物化/FAILED | — | 不变 | 无 |

## 3. filter 兜底策略（诚实边界）

- **可翻译子集**：`==/===/!=/!==/>/>=/</<=`（字段 vs 标量，可换序）、`and/or/!`、`in`（数组）。
- **不可翻译**（裸 var 真值、字段对字段、map/filter/算术、对象字面量等）→ `filterPushedDown=false`：
  - 非聚合分支：拉全量（安全上限 100k）+ 内存 jsonLogic 求值——行为 100% 保留；
  - **聚合分支：显式 BadRequest**（"无法与分组汇总组合使用"）——preview 即时反馈给配置作者，refresh 落 FAILED 同文案。理由：聚合+异型 filter 无法既下推又保语义，两害取其轻。

## 4. 安全与隔离

- 标识符（别名/字段键）白名单 `IDENT_RE`/`FIELD_KEY_RE` 校验后内联；值全部 `$n` 参数绑定（`$queryRawUnsafe`）。
- raw SQL 不经 `$extends`：显式 `tenant_id = $1 AND environment_id = $2`（缺省 prod，R1.4 先例）。DatasetRow 维持租户级（现状无环境维度）。
- 新增结果安全上限 `DATAFLOW_MAX_RESULT_ROWS=100000`（join 笛卡尔展开防护；旧引擎受源上限间接约束，此处显式化）。

## 5. 踩坑

1. 单源分支曾双重别名（子查询已带 `AS q_x (data)` 又叠加 `q (data)`）→ PG 42601。
2. PG **没有 `MIN(jsonb)`**（42883）→ 组值取 `(array_agg(...))[1]`。
3. `$queryRawUnsafe` 在测试基建的 Proxy mock 中需顶层特判（同 `$transaction`），并纳入 beforeEach 重置。
4. 引擎改为单次 `$queryRawUnsafe` 后，旧 spec 的"按 findMany 调用序 mock 数据源"模式整体失效——mock 策略改为夹具行注入。

## 6. 明确不做（后续项）

chart-data.service 内存聚合 SQL 化（读侧 10k 上限兜底）；多表/多 join；跨数据集数据源嵌套；物化行环境隔离。
