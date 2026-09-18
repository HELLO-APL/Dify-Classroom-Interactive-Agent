# 主动引导智能体

一个由**课程计划驱动、AI 自动推进**的课堂智能体。

> 本仓库是 `HELLO-APL/Dify-Classroom-Interactive-Agent` 的重构版。
> 旧仓库 `D:\project\Dify 课堂互动智能体` 保留不动，仅作参照。
>
> **主要变化**：移除学生标注 · 移除 n8n 与前端 · 改为四阶段（可配置）编排模型 · 新增 LangGraph 编排结构 · 目录改为无空格英文命名。

---

## 这是什么

学生端不是一个"学生问、AI 答"的聊天机器人，而是**一个按老师排好的课程计划自动推进的课堂**：

```
老师配置 lesson-plan.json  ──→  AI 每轮读计划 + 判证据 + 判耗时  ──→  自动切幕
（上几个阶段、每阶段多久）        （编排器 host_phase 状态机）          （把课上完）
```

**核心设计：** 提示词负责"怎么教"，数据负责"教什么、按什么顺序教、多久教完"。改课程结构不用改提示词。

> **本仓库只做智能体逻辑与规则，不含前端、不含 n8n。**
> 所有产物是 Markdown 规则 + JSON 配置 + 一份编排规范。

---

## 目录结构

```
主动引导智能体/
├── rules/                       # 规则层（AI 每轮只读，老师维护）
│   ├── KNOWLEDGE-BASE.md        # 知识点目录（含 4 个探究字段）
│   ├── interaction/             # 课堂节奏规则、判星规则、各文件格式模板
│   │   ├── SKILL.md             #   课堂互动 Skill（阶段行为）
│   │   ├── MASTERY-STAR-RULES.md   # 0-5 星唯一权威规则
│   │   └── *-FORMAT.md          #   七个运行时文件的字段模板
│   └── dialogue/SKILL.md        # 对话 Skill（学生轮次路由）
│
├── lesson-data/                 # 课程数据层（老师配置）
│   ├── lesson-plan.json         #   ★ 编排入口：阶段开关 + 时长预算 + 推进策略 + 时钟策略
│   └── segments/seg-XXX.json    #   课程片段（order 定顺序，绑定 KP）
│
├── stages/                      # 阶段内容层（可空壳，留空不影响运行）
│   ├── recap_discussion/        #   复述：questions.md / rubric.md / prompt.md
│   ├── deep_inquiry/            #   深挖：questions.md / rubric.md / prompt.md
│   └── class_discussion/        #   讨论：questions.md / rubric.md / prompt.md
│
├── runtime/                     # 运行时状态（每轮读写）
│   ├── DIALOGUE-LOG.md          #   ★ 会话控制 + 编排器字段
│   ├── TMISSION.md              #   老师目标、核心难点、易混淆点
│   ├── LESSON-CONTENT.md        #   本课内容（先修/新内容/任务/成功证据）
│   ├── SMISSION.md              #   学生个人目标
│   ├── NOTES.md                 #   工作观察与偏好
│   ├── GLOSSARY.md              #   已挣得的词汇
│   ├── LEARNING-RECORD.md       #   持久学习记录
│   └── data/                    #   掌握度与对话流水（json）
│       ├── mastery-state.json
│       ├── mastery-history.json
│       └── dialogue-log.json
│
└── orchestrator/                # 编排器结构规范
    ├── ORCHESTRATOR.md          #   ★ LangGraph 状态图、节点、条件边、调度约定
    ├── clock_reference.py       #   真实时钟与切幕判定的可运行参考实现 + 回归测试
    └── MIGRATION.md             #   从旧仓库迁移的映射与变更记录
```

---

## 五个阶段

| 阶段 | `host_phase` | 时间 | 干什么 | 星级影响 |
| --- | --- | --- | --- | --- |
| 开场 | `intro` | — | 交代目标与互动方式 | — |
| 引导学习 | `guided_learning` | 0-50% | 讲解 + 主动提问 | 1 星（已接触） |
| 复述与讨论 | `recap_discussion` | 50-70% | 学生复述，AI 补缺口 | 2-3 星 |
| 深层探究 | `deep_inquiry` | 70-85% | 追问为什么/如何/用在哪/跨学科 | 4 星 |
| 全班讨论 | `class_discussion` | 85-100% | 老师主导，AI 退居协助 | 只记快照 |
| 收尾 | `ending` | — | 总结 + 遗留问题 | — |

**阶段可自由启停**：`lesson-plan.json` 里 `enabled: false` 即可跳过。

---

## 老师配一门课：三步

### 1. 定阶段与时长

编辑 `lesson-data/lesson-plan.json`：

```json
{
  "lesson_id": "ch3-process-scheduling",
  "total_minutes": 45,
  "stages": [
    { "id": "guided_learning",  "enabled": true,  "minutes": 22, "advance_when": "either" },
    { "id": "recap_discussion", "enabled": true,  "minutes": 9,  "advance_when": "either" },
    { "id": "deep_inquiry",     "enabled": true,  "minutes": 7,  "advance_when": "either" },
    { "id": "class_discussion", "enabled": false, "minutes": 7,  "advance_when": "budget" }
  ]
}
```

| 字段 | 含义 |
| --- | --- |
| `enabled` | `false` → **整段跳过**（比如这门课不要讨论） |
| `minutes` | 这一幕的**时长预算** |
| `advance_when` | `either`（证据达标或时间到）/ `evidence`（学透才走）/ `budget`（只看时间） |

### 1.1 时间怎么算（真实时钟）

编排器**用真实时间**推进，不看"聊了几轮"，也不靠 LLM 估算时长。每轮由会话层把当前时间戳（`now`）注入状态，编排器只做一件事：

```
stage_elapsed_minutes  = now - stage_started_at     # 本幕已花分钟
lesson_elapsed_minutes = now - lesson_started_at    # 本课已花分钟
```

到点（`minutes` 预算耗尽）就切下一幕。**编排器不管学生是否在场** —— 那是老师的事。

```json
"advance_policy": {
  "on_budget_exhausted": "wrap_up",       // 预算耗尽：wrap_up 收尾后切 / force_advance 立即切 / extend 允许延长
  "on_evidence_reached": "advance",       // 证据达标：切幕
  "min_stage_minutes": 2,                 // 最短幕时长，防止秒切
  "max_stage_overrun_minutes": 3          // extend 模式下最多超时多少
}
```

> 时间戳由会话层注入而非编排器自己取，是为了让切幕逻辑**可单测、可回放**。
> 参考实现与 11 条回归测试见 `orchestrator/clock_reference.py`。

### 2. 填课程内容

| 要写什么 | 写在哪 | 现状 |
| --- | --- | --- |
| 知识点 + 检测问题 + 4 个探究字段 | `rules/KNOWLEDGE-BASE.md` | 探究字段待填 |
| 老师目标、核心难点（检验问题）、易混淆点 | `runtime/TMISSION.md` | 内容已有 |
| 本课先修/新内容/任务/成功证据 | `runtime/LESSON-CONTENT.md` | 内容已有 |
| 每个片段讲什么 | `lesson-data/segments/seg-XXX.json` | 已有 |
| 各阶段的问题与评判标准 | `stages/<阶段>/questions.md` · `rubric.md` | **暂不填（按需）** |

### 3. 交付给编排器

按 `orchestrator/ORCHESTRATOR.md` 实现状态图。老师侧无需理解节点连法 —— **规则与配置就是燃料**。

---

## 空壳也能跑

**关键约定**：阶段内容可以完全不写，编排器照常运行。

| 缺失 | 降级行为 |
| --- | --- |
| `stages/<id>/questions.md` 空 | 改用 `KNOWLEDGE-BASE.md` 的 `检测问题` |
| `stages/<id>/rubric.md` 空 | 只用 `MASTERY-STAR-RULES.md` 的通用标准 |
| `stages/<id>/prompt.md` 空 | 用内置默认提示词 |
| `class_discussion` 无内容 | AI 提示"请老师主导"+ 计时，然后切幕 |

所以**整条链路现在就是可运行的**，只是问法朴素。填上 `stages/` 后质量自然提升，不需要改代码。

---

## 已经移除的功能

| 移除项 | 说明 |
| --- | --- |
| **学生标注（class point）** | 标记点、`points/*.json`、`point_review` 幕、「继续」事件、标注接口 |
| **区分问题** | 该概念废弃。易混淆点只在 `TMISSION.md` 列名称 |
| 1 星"已标注" | 改为 **"已接触"**（AI 讲过即记，不再依赖标注） |
| `source: class_point` | 剩余来源：`dialogue` / `assessment` / `manual` |
| `lecturing` / `segment_summary` 幕 | 被四阶段模型取代 |
| **n8n 工作流** | 本仓库不再包含 `workflow/` 与 n8n 节点 |
| **前端** | 本仓库不再包含 `apps/`、课堂页面、学生 workspace 页面 |
| `LESSON-INTERACTION.md` | 改名为 `LESSON-CONTENT.md`（旧名与实际内容不符） |

---

## 关键文档

| 文档 | 内容 |
| --- | --- |
| `orchestrator/ORCHESTRATOR.md` | **编排器结构**：LangGraph 状态 schema、节点、条件边、文件调度、校验规则 |
| `orchestrator/MIGRATION.md` | 新旧路径映射与变更记录 |
| `rules/interaction/MASTERY-STAR-RULES.md` | **0-5 星唯一权威规则** + 阶段快照机制 |
| `rules/interaction/DIALOGUE-LOG-FORMAT.md` | 会话状态字段（含编排器字段） |
| `rules/interaction/LESSON-CONTENT-FORMAT.md` | `LESSON-CONTENT` 与 `TMISSION` 的分工 |
| `stages/*/README.md` | 各阶段在干什么、没配置时怎么降级 |

---

## 已知缺口（待解决）

| 缺口 | 影响 | 优先级 |
| --- | --- | --- |
| **无定时器** | 学生不发消息时无法自动切幕（只能靠每轮对话内判断） | 高 |
| **对话记忆窗口有限** | 长课程可能丢上下文 | 高 |
| **视频位置接口未打通** | `source.position` 是占位符 | 中 |
| **判星粒度未定** | 各阶段星级的精确判定标准待明确 | 中 |
| **`class_discussion` 内容为空** | 当前刻意留空，AI 不参与讨论 | 低（设计如此） |
