# 从旧仓库迁移的映射与变更记录

> 迁移日期：2026-09-17
> 源仓库：`D:\project\Dify 课堂互动智能体`（**保持不动，仅作参照**）
> 目标仓库：`D:\project\主动引导智能体`（本仓库）
> 上游：`HELLO-APL/Dify-Classroom-Interactive-Agent`

---

## 一、路径映射表

| 旧路径 | 新路径 | 处理 |
| --- | --- | --- |
| `class agent/` | `rules/` | 目录改名（去掉空格） |
| `class agent/class-interaction/` | `rules/interaction/` | 改名 + 内容改造 |
| `class agent/dialogue/` | `rules/dialogue/` | 改名 + 内容改造 |
| `class agent/KNOWLEDGE-BASE.md` | `rules/KNOWLEDGE-BASE.md` | **新增 4 个探究字段** |
| `class-point/segments/` | `lesson-data/segments/` | 原样迁移 |
| `class-point/points/` | — | **不迁移**（标注功能移除） |
| `teach test/` | `runtime/` | 改名 + 重置为空白模板 |
| `classroom-chat/` | `apps/classroom-chat/` | 移入 apps/ |
| `student-workspace/` | `apps/student-workspace/` | 移入 apps/ + data 重置 |
| `workflow/` | `workflow/` | 待改造 |
| `docs/` | `docs/` | 待更新 |
| `archive/` | — | **不迁移**（旧实验，留在旧仓库） |
| `start-classroom-chat.cmd` | `start-classroom-chat.cmd` | 待改路径 |
| — | `lesson-data/lesson-plan.json` | **全新**（编排入口） |
| — | `stages/` | **全新**（三阶段内容层） |
| — | `orchestrator/ORCHESTRATOR.md` | **全新**（LangGraph 编排规范） |

---

## 二、内容迁移明细

### 原样迁移（内容不变）

| 文件 | 说明 |
| --- | --- |
| `lesson-data/segments/seg-001~006.json` | 课程片段，属课程内容而非用户记录 |
| `rules/KNOWLEDGE-BASE.md` | 知识点正文保留，仅追加 4 个空探究字段 |
| `runtime/TMISSION.md` | 老师写的第3章目标与难点，**内容完整保留** |
| `runtime/LESSON-INTERACTION.md` | 本课内容与区分问题，**内容完整保留** |

> `TMISSION.md` 与 `LESSON-INTERACTION.md` 是**老师课程内容**，不是用户运行时记录，所以迁移。
> 它们缺少新增的 `检验问题` 字段，待老师补充。

### 重置为空白模板（旧数据丢弃）

按用户确认"用户运行时记录可直接删除"：

| 文件 | 旧内容 | 新状态 |
| --- | --- | --- |
| `runtime/DIALOGUE-LOG.md` | 旧会话状态（lecturing / seg-002） | 空白初始状态（uninitialized） |
| `runtime/SMISSION.md` | 旧学生目标 | 空白模板 |
| `runtime/NOTES.md` | 旧工作观察 | 空白模板 |
| `runtime/GLOSSARY.md` | 旧词汇 | 空白模板 |
| `runtime/LEARNING-RECORD.md` | 旧记录 | 空白模板 |
| `apps/student-workspace/data/*.json` | 旧掌握/对话数据 | 空白模板 |
| `class-point/points/*.json` | 标记点 | **不迁移** |

---

## 三、功能变更

### 移除：学生标注

| 移除项 | 原位置 |
| --- | --- |
| 标记点数据 | `class-point/points/*.json` |
| `point_review` 幕 | `class agent/class-interaction/SKILL.md` |
| 「继续」事件与固定收尾语 | 同上 + `dialogue/SKILL.md` |
| 标记点路由 | `dialogue/SKILL.md` |
| 1 星"已标注"定义 | `MASTERY-STAR-RULES.md` |
| `source: class_point` | 同上 |
| `annotation_ids` / `last_annotation_id` 字段 | 同上 |
| 前置读取 `class-point/points` | `class-interaction/SKILL.md` |

### 新增：探索/复述/讨论三阶段

| 新增 | 位置 |
| --- | --- |
| 阶段内容层（问题/标准/提示词） | `stages/` 三个目录 |
| 四阶段 `host_phase` 枚举 | `DIALOGUE-LOG-FORMAT.md` |
| 编排器字段 | `DIALOGUE-LOG-FORMAT.md` |
| 阶段快照机制 | `MASTERY-STAR-RULES.md` |
| 课程计划配置 | `lesson-data/lesson-plan.json` |
| LangGraph 编排规范 | `orchestrator/ORCHESTRATOR.md` |
| KP 4 个探究字段 | `rules/KNOWLEDGE-BASE.md` |
| 核心难点的 `检验问题` 字段 | `TMISSION-FORMAT.md` |

### 改名

| 旧 | 新 | 原因 |
| --- | --- | --- |
| 1 星"已标注" | **1 星"已接触"** | 标注移除后星级需保持连续 |
| `lecturing` / `segment_summary` | `guided_learning` / `recap_discussion` | 四阶段模型 |
| `class agent` | `rules` | 去空格 |
| `class-point` | `lesson-data` | 去空格 + 语义更准 |
| `teach test` | `runtime` | 去空格 + 语义更准 |

---

## 四、旧 n8n 节点对应

| 旧节点 | 新归属 | 变化 |
| --- | --- | --- |
| Chat Trigger | 外部入口 | 不变 |
| Normalize Input | `load_context` | 合并 |
| Read Rule Files | `load_context` | 路径改 `rules/` |
| Read State Files | `load_context` | 路径改 `runtime/` |
| **Read Class Point Files** | — | **删除** |
| Combine Context | `load_context` | 改按阶段分层 |
| Teach Session Agent | `teach` | 提示词按阶段拆分 |
| Prepare State Writes | `write_state` | 合并 |
| **State Markdown to Binary** | — | **删除** |
| Write State Files | `write_state` | 路径改 |
| Format Chat Reply | `format_reply` | 保留 |
| — | **`load_plan`** | 新增 |
| — | **`judge_advance`** | 新增（编排核心） |
| — | **`advance_stage`** | 新增 |

---

## 五、待办

- [ ] `workflow/` 下 n8n 工作流按新节点结构改造
- [ ] `apps/classroom-chat/server.mjs` 删除 points 接口 + 改路径
- [ ] `apps/classroom-chat/public/*` 与 `student-workspace/public/*` 前端删标注入口
- [ ] `start-classroom-chat.cmd` 改路径
- [ ] `docs/` 五份文档更新（删 class_point 表，写新编排器）
- [ ] `runtime/TMISSION.md` 补 `检验问题` 字段
- [ ] `runtime/LESSON-INTERACTION.md` 去重易混淆点列表
- [ ] `rules/KNOWLEDGE-BASE.md` 填 4 个探究字段
