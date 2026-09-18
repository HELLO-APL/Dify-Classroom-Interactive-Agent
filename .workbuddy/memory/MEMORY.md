# 主动引导智能体 — 项目长期笔记

## 项目定位
本项目 = `Dify 课堂互动智能体`(GitHub: HELLO-APL/Dify-Classroom-Interactive-Agent)的重构版。
旧仓库 `D:\project\Dify 课堂互动智能体` **保留不动**,只作参照;重构产物落在本目录,已 git init(首个提交 a0ca473)。

## 核心设计约定(2026-09-17 用户确认)
- **编排器** = `runtime/DIALOGUE-LOG.md` 的 `host_phase` 状态机 + 老师端配置 `lesson-data/lesson-plan.json`。AI 每轮读计划→判证据+判耗时→写回切幕,把一门课在规定时间内上完。
- 阶段枚举:intro / guided_learning / recap_discussion / deep_inquiry / class_discussion / ending。**阶段可按课程启停**(`enabled:false` 整段跳过),每阶段有 `minutes` 时长预算。
- `advance_when` 三值:either(证据或时间)/ evidence(学透才走)/ budget(只看时间)。
- **学生标注功能永久移除**:point_review 幕、points/*.json、1星"已标注"、source=class_point、annotation_ids、「继续」事件。
- **1 星改名为"已接触"**(AI 讲过即记),使星级在无标注情况下保持 0-5 连续。
- **掌握评分靠后三阶段表现阶段性记录**:复述(2-3星)、探究(4星)、讨论(只记快照)。新增 stage_snapshot 机制写入 mastery-history.json。
- 三阶段内容独立成 `stages/<stage>/`:questions.md(老师出题)/ rubric.md(评判标准)/ prompt.md(AI提示词),**可空壳,留空不影响运行**(有降级兜底)。
- `KNOWLEDGE-BASE.md` 新增 4 个探究字段:为什么这样设计/如何实现/解决什么实际问题/关联学科 —— 这是深层探究阶段唯一燃料。
- "区分问题" 概念**已废弃**(2026-09-17):不再出现于任何格式要求中。易混淆点仅在 `TMISSION.md` 列 A vs B 名称,不写提问方式。
- **复述/探究阶段的提问链路**:`stages/<stage>/questions.md`(老师出题,现为空) → 为空则降级用 `runtime/TMISSION.md` 的 `检验问题`(已补齐 4 条,挂 KP 编号) → 再降级用 `rules/KNOWLEDGE-BASE.md` 的 `检测问题`。三级兜底,保证空壳也能上课。
- 目录用无空格英文名:rules/ lesson-data/ runtime/ apps/ stages/ orchestrator/ workflow/。
- 旧用户运行时记录不迁移,runtime/ 与 workspace data 用空白模板初始化。

## 编排器时钟约定（2026-09-18 确认方案 B）
- **真实时钟，不靠 LLM 估算时长**。`now` 由会话层**注入 state**，图内节点一律不调 `datetime.now()` → 图是纯函数，可单测可回放。
- **新增 `tick` 节点**（总计 10 个节点）：所有时间计算集中于此，是唯一读时间的地方。
- **时钟只算已花时长，仅此而已**：
  `stage_elapsed_minutes = now - stage_started_at`，`lesson_elapsed_minutes = now - lesson_started_at`。
- ⚠️ **编排器绝不判断学生是否缺席**（2026-09-18 用户明确要求）。
  曾误加 `clock_policy`（挂机判定/缺席策略/净时长折算），已全部删除。
  学生是否在场是老师的事；编排器引入这类判定只会让切幕变得不可预测。
  不要以任何理由重新引入 absent / idle / 有效时长折算等概念。
- 本地无 `datetime.now()` 依赖，便于测试。

## 关键文件
- `orchestrator/ORCHESTRATOR.md` — LangGraph 编排规范(State schema / 10 节点 / tick 时钟 / judge_advance 判定 / 分层装配 / 降级行为 / 校验清单)
- `orchestrator/HOW-IT-WORKS.md` — 大白话运作过程说明 + 关键 LangGraph 写法(给想理解编排器的人看)
- `orchestrator/graph_skeleton.py` — LangGraph 骨架代码(11 节点签名 + 建图 + 路由)，非完整实现
- `orchestrator/clock_reference.py` — 时钟与切幕的可运行参考实现 + 11 条回归测试
- `orchestrator/MIGRATION.md` — 新旧路径映射与变更记录
- `rules/interaction/MASTERY-STAR-RULES.md` — 0-5 星唯一权威规则
- `lesson-data/lesson-plan.json` — 老师端编排入口

## 关键 LangGraph 写法约定
- **判断写进 state，路由只读不判**：`judge_advance` 做全部判定并把结果写 `target_phase`；
  `route_after_judge` 只 `return "next_stage" if target_phase else "stay"`。
  好处：路由函数极简、判定可单测、判决有痕迹(`advance_reason`)。
- **`stage_snapshots` 必须用 `Annotated[list[dict], operator.add]`**：否则第二幕快照会覆盖第一幕。
- **节点签名统一 `(state) -> dict`，只返回要改的字段**，不返回的保持原值。
- **自动推进的本质是图里有一个环**：每轮对话重新评估一次，不是后台定时器。

## 环境备注
- 本机 bash 的 PATH 缺 dirname/ls 等，需 `export PATH="/usr/bin:/bin:$PATH"` 修复；PowerShell stdout 会吞输出，优先用 bash+文件落盘。
- workbuddy.link 分享页数据可从 workbuddy-space-static.codebuddy.work/page/<id>/0/conversation-data.json 直接拉取。
- **离线环境装不了 langgraph**(pip: no matching distribution)。
  验证图拓扑的替代手法：伪造 `langgraph.graph.StateGraph` 桩，记录 add_node/add_edge/
  add_conditional_edges 调用后断言，无需真实依赖。
- 隔离 Python 环境: `C:/Users/陈怡凡/.workbuddy/binaries/python/envs/default/`

## 环境备注
- 本机 bash 的 PATH 缺 dirname/ls 等,需 `export PATH="/usr/bin:/bin:$PATH"` 修复;PowerShell stdout 会吞输出,优先用 bash+文件落盘。
- workbuddy.link 分享页数据可从 workbuddy-space-static.codebuddy.work/page/<id>/0/conversation-data.json 直接拉取。
