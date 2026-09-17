# 主动引导智能体

一个由**课程计划驱动、AI 自动推进**的课堂智能体。

> 本仓库是 `HELLO-APL/Dify-Classroom-Interactive-Agent` 的重构版。
> 旧仓库 `D:\project\Dify 课堂互动智能体` 保留不动，仅作参照。
>
> **主要变化**：移除学生标注功能 · 改为四阶段（可配置）编排模型 · 新增 LangGraph 编排器结构 · 目录改为无空格英文命名。

---

## 这是什么

学生端不是一个"学生问、AI 答"的聊天机器人，而是**一个按老师排好的课程计划自动推进的课堂**：

```
老师配置 lesson-plan.json  ──→  AI 每轮读计划 + 判证据 + 判耗时  ──→  自动切幕
（上几个阶段、每阶段多久）        （编排器 host_phase 状态机）          （把课上完）
```

**核心设计：** 提示词负责"怎么教"，数据负责"教什么、按什么顺序教、多久教完"。改课程结构不用改提示词。

---

## 目录结构

```
主动引导智能体/
├── rules/                      # 规则层（AI 每轮只读，老师维护）
│   ├── KNOWLEDGE-BASE.md       # 知识点目录（含 4 个探究字段）
│   ├── interaction/            # 课堂节奏规则、判星规则、各文件格式模板
│   │   ├── SKILL.md            #   课堂互动 Skill（主持人事件 + 阶段行为）
│   │   ├── MASTERY-STAR-RULES.md  # 0-5 星唯一权威规则
│   │   └── *-FORMAT.md         #   七个运行时文件的字段模板
│   └── dialogue/SKILL.md       # 对话 Skill（学生轮次路由）
│
├── lesson-data/                # 课程数据层（老师配置）
│   ├── lesson-plan.json        #   ★ 编排入口：阶段开关 + 时长预算 + 推进策略
│   └── segments/seg-XXX.json   #   课程片段（order 定顺序，绑定 KP）
│
├── stages/                     # 阶段内容层（可空壳，留空不影响运行）
│   ├── recap_discussion/       #   复述：questions.md / rubric.md / prompt.md
│   ├── deep_inquiry/           #   深挖：questions.md / rubric.md / prompt.md
│   └── class_discussion/       #   讨论：questions.md / rubric.md / prompt.md
│
├── runtime/                    # 运行时状态（每轮读写）
│   ├── DIALOGUE-LOG.md         #   ★ 会话控制 + 编排器字段
│   ├── TMISSION.md             #   老师目标与难点
│   ├── LESSON-INTERACTION.md   #   本课内容与区分问题
│   └── SMISSION / NOTES / GLOSSARY / LEARNING-RECORD.md
│
├── orchestrator/               # 编排器结构规范
│   └── ORCHESTRATOR.md         #   ★ LangGraph 状态图、节点、条件边、调度约定
│
├── apps/                       # 应用层
│   ├── classroom-chat/         #   课堂聊天页面
│   └── student-workspace/      #   学生工作区（data/ 为空白模板）
│
└── workflow/                   # n8n 相关工作流
```

---

## 快速开始

### 1. 配一门课

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

- `enabled: false` → **整段跳过**（比如这门课不要讨论）
- `minutes` → 这一幕的**时长预算**
- `advance_when` → `either`（证据达标或时间到）/ `evidence`（学透才走）/ `budget`（只看时间）

### 2. 准备课程内容

| 要写什么 | 写在哪 |
| --- | --- |
| 知识点 + 检测问题 + 4 个探究字段 | `rules/KNOWLEDGE-BASE.md` |
| 老师目标、核心难点、易混淆点 | `runtime/TMISSION.md` |
| 易混淆点的**区分问题** | `runtime/LESSON-INTERACTION.md` |
| 每个片段讲什么 | `lesson-data/segments/seg-XXX.json` |

### 3. 跑起来

```
双击 start-classroom-chat.cmd
课堂页面：http://127.0.0.1:4173
学生 workspace：http://127.0.0.1:4173/student/
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

## 空壳也能跑

**这是本设计的关键约定**：阶段内容可以完全不写，编排器照常运行。

| 缺失 | 降级行为 |
| --- | --- |
| `stages/<id>/questions.md` 空 | 改用 `KNOWLEDGE-BASE.md` 的 `检测问题` |
| `stages/<id>/rubric.md` 空 | 只用 `MASTERY-STAR-RULES.md` 的通用标准 |
| `stages/<id>/prompt.md` 空 | 用内置默认提示词 |
| `class_discussion` 无内容 | AI 提示"请老师主导"+ 计时，然后切幕 |

**你现在就可以跑通整条链路**，只是问法朴素。填上 `stages/` 后质量自然提升，不需要改代码。

---

## 已经移除的功能

| 移除项 | 说明 |
| --- | --- |
| **学生标注（class point）** | 标记点、`points/*.json`、`point_review` 幕、「继续」事件、标注接口 |
| 1 星"已标注" | 改为 **"已接触"**（AI 讲过即记，不再依赖标注） |
| `source: class_point` | 剩余来源：`dialogue` / `assessment` / `manual` |
| `lecturing` / `segment_summary` 幕 | 被四阶段模型取代 |

---

## 关键文档

| 文档 | 内容 |
| --- | --- |
| `orchestrator/ORCHESTRATOR.md` | **编排器结构**：LangGraph 状态 schema、节点、条件边、文件调度、校验规则 |
| `rules/interaction/MASTERY-STAR-RULES.md` | **0-5 星唯一权威规则** + 阶段快照机制 |
| `rules/interaction/DIALOGUE-LOG-FORMAT.md` | 会话状态字段（含编排器字段） |
| `stages/*/README.md` | 各阶段在干什么、没配置时怎么降级 |

---

## 已知缺口（待解决）

| 缺口 | 影响 | 优先级 |
| --- | --- | --- |
| **无定时器** | 学生不发消息时无法自动切幕（只能靠每轮对话内判断） | 高 |
| **对话记忆窗口有限** | 长课程可能丢上下文 | 高 |
| **视频位置接口未打通** | `source.position` 是占位符 | 中 |
| **`class_discussion` 内容为空** | 当前刻意留空，AI 不参与讨论 | 低（设计如此） |
| **判星粒度未定** | 各阶段星级的精确判定标准待明确 | 中 |
