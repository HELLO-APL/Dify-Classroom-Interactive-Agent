# DIALOGUE-LOG Format

`DIALOGUE-LOG.md` 是**当前会话的控制块**，也是编排器读写的核心状态文件。

原始学生/AI 消息存在 `runtime/data/dialogue-log.json`；掌握度存在 `mastery-state.json` / `mastery-history.json`。

> **2026-09 重构说明**：`host_phase` 枚举已更新（移除 `point_review`、新增三个阶段），并新增**编排器字段**（阶段预算、耗时、切幕原因）。

---

## Template

```md
# DIALOGUE-LOG

## 会话状态
- student_id: {student id}
- lesson_id: {lesson id}
- speaker: {host | student}

### 编排器
- host_phase: {uninitialized | intro | guided_learning | recap_discussion | deep_inquiry | class_discussion | ending}
- active_segment_id: {segment id or 无}
- now: {ISO8601 本轮时间戳，由会话层注入}
- lesson_started_at: {ISO8601 or 无}
- last_activity_at: {ISO8601 or 无}
- stage_started_at: {ISO8601 or 无}
- stage_teach_minutes: {number}      ← 净时长（不含挂机），切幕判定用这个
- stage_elapsed_minutes: {number}    ← 墙钟时长，给老师复盘用
- lesson_teach_minutes: {number}
- lesson_elapsed_minutes: {number}
- stage_budget_minutes: {number}
- idle_elapsed_minutes: {number}     ← 距上一轮的间隔
- idle_fraction: {number 0-1}        ← 该间隔中算作课时的比例
- absence_kind: {normal | absent}    ← 是否判定为人不在
- remaining_stages: {尚未演出的阶段列表}
- advance_reason: {为什么切幕 or 无}

### 教学
- phase: {未初始化 | dialogue | ended}
- current_target: {难点 | 易混淆点 | 知识点}
- current_question: {exact open question or 无}
- attempts: {number}
- mastered: {本幕被证据关闭的目标}
- unresolved: {本幕仍未关闭的目标}

### 学生
- student_status: {active | practicing | waiting | ended}
- wait_what_used: {count}
- research_used: {count}
- help_used: {count}
- inactivity_step: {0 | 1 | 2 | 3}

## 本轮证据
- {evidence}

## 下次重点
- {evidence-backed next focus}
```

---

## host_phase 新枚举说明

| 值 | 这一幕 | 由什么推进进来 |
| --- | --- | --- |
| `uninitialized` | 未开场 | 系统初始状态 |
| `intro` | 开场引导 | 系统自动 |
| `guided_learning` | AI 引导学习（0-50%） | 上一幕结束 |
| `recap_discussion` | 复述与讨论（50-70%） | 上一幕结束 |
| `deep_inquiry` | 深层探究（70-85%） | 上一幕结束 |
| `class_discussion` | 全班讨论（85-100%） | 上一幕结束 |
| `ending` | 收尾总结 | 上一幕结束 |

> **已移除**：`lecturing`、`segment_summary`、`point_review`。
> `point_review`（标记点答疑）随标注功能一并删除。

---

## 编排器字段说明

| 字段 | 谁写 | 作用 |
| --- | --- | --- |
| `now` | **会话层注入** | 本轮时间戳。编排器不自己取时间，保证可单测、可回放 |
| `lesson_started_at` | 编排器（开课） | 本课开始时刻，用于算总墙钟时长 |
| `last_activity_at` | 编排器（每轮） | 上一轮有效活动时刻，用于算本轮间隔 |
| `stage_started_at` | 编排器（切幕时） | 本幕开始时刻，用于算本幕墙钟时长 |
| `stage_teach_minutes` | 编排器（`tick`） | **净时长，切幕判定只看这个** |
| `stage_elapsed_minutes` | 编排器（`tick`） | 墙钟时长，给老师看真实耗时 |
| `stage_budget_minutes` | 编排器（读 plan 时） | 本幕预算，来自 `lesson-plan.json` |
| `lesson_teach_minutes` | 编排器（`tick`） | 本课净时长累计 |
| `lesson_elapsed_minutes` | 编排器（`tick`） | 本课墙钟时长累计 |
| `idle_elapsed_minutes` | 编排器（`tick`） | 距上一轮的间隔，用于判定是否挂机 |
| `idle_fraction` | 编排器（`tick`） | 该间隔中算作课时的比例（1 / 0.25 / 0） |
| `absence_kind` | 编排器（`tick`） | `normal` / `absent`。**只看上一轮距今多久**，不看本幕开了多久 |
| `remaining_stages` | 编排器（切幕时） | 尚未演出的阶段，`enabled: false` 的已被过滤 |
| `advance_reason` | 编排器（切幕时） | 记录为什么切幕，便于老师复盘 |

> **净时长 vs 墙钟时长**：切幕只看 `*_teach_minutes`。否则学生挂机十分钟会把整幕顶过预算、AI 一字未讲就被切走。墙钟时长照常记录，老师需要知道"这 45 分钟里有多少是在发呆"。

---

## 时钟策略（来自 `lesson-plan.json` 的 `clock_policy`）

上面这些字段的**取值口径由老师配置**，写在 `lesson-data/lesson-plan.json`：

| 字段 | 默认 | 作用 |
| --- | --- | --- |
| `idle_gap_minutes` | 8 | 单轮间隔超过此值 → 该轮只按 `idle_credit_ratio` 记课时 |
| `idle_credit_ratio` | 0.25 | 上一条的折扣比例。设为 1 则关闭挂机折扣 |
| `absence_grace_minutes` | 15 | 单轮间隔超过此值 → 判 `absence_kind=absent`，该轮记 0 |
| `absent_policy` | `extend` | 人不在时怎么办：`extend` 冻结预算等学生 / `skip` 跳过本幕 / `end` 提前结束 |

> 缺失时用上表默认值，**不阻断开课**。
> 判定"人不在"只看 `now - last_activity_at`，**不看本幕开了多久** —— 否则幕一旦超过宽限就会永久冻结预算，课下不来。

---

## Rules

- 只记录**会话控制与证据**，不记录每一条消息。
- 原始对话追加到 `dialogue-log.json`，不在这里重复。
- 掌握度变化写入 `mastery-state.json` / `mastery-history.json`，不以此文件为准。
- 本文件的 `mastered` / `unresolved` 只描述**本幕目标**，不是全局掌握档案。
- `???` 使 `wait_what_used` 加一。
- 无法说明来源的问题，不得写成有依据的证据。
- 下次重点必须指向老师目标、课程文件或知识点。
- **切幕只能由编排器（`judge_advance`）决定**，教学节点不得自行改 `host_phase`。
