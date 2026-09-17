# TMISSION Format

`TMISSION.md` stores the teacher/class mission for the current lesson. One mission per lesson, shared by the whole class.

> **2026-09 重构**：`核心难点` 新增 `检验问题` 字段 —— 这是复述/探究阶段提问的直接来源。

## Template

```md
# TMISSION: {lesson or topic}

## 老师为什么设置这节课
{the real classroom outcome the teacher wants}

## 全班共同目标
- {observable outcome}

## 核心难点
- {KP-xxx} {difficulty}
  - 检验问题: {the question that tests whether the student got this}
  - 答对证据: {what a correct student answer looks like}
  - 易错表现: {what a wrong or shallow answer sounds like}

## 易混淆点
- {KP-xxx} {A} vs {B}

## 老师需要学生主动说出或做出
- {student-owned output}

## 不允许由 AI 代答
- {teacher wants the student to produce for themselves}
```

## Rules

- Write outcomes the teacher can observe, not teaching intentions.
- **每个难点必须写 `检验问题`** —— 没有检验问题，复述阶段就没有可问的题。
- Every difficulty entry must carry both evidence and error shape so the dialogue skill can recognize progress.
- Tie each difficulty and confusion pair to a stable `KP-xxx` in `KNOWLEDGE-BASE.md` when the directory exists.
- Keep the file short enough to fit one lesson. Long curriculum plans belong elsewhere.

## 职责分工（避免与 LESSON-INTERACTION 打架）

| 内容 | 写在哪个文件 |
| --- | --- |
| 易混淆点（**只在这里列**） | `TMISSION.md` |
| 易混淆点的**区分问题** | `LESSON-INTERACTION.md` |
| 核心难点 + 检验问题 + 答对证据 + 易错表现 | `TMISSION.md` |

> 同一组"易混淆点 A vs B"不要在两个文件里都写，只在 TMISSION 列出，在 LESSON-INTERACTION 里给区分问题。
