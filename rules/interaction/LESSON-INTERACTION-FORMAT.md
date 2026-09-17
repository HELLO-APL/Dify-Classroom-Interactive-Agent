# LESSON-INTERACTION Format

`LESSON-INTERACTION.md` stores the current lesson the AI will interact around. It is the grounded content source: questions and explanations trace back here.

> **2026-09 重构**：明确本文件**只负责易混淆点的「区分问题」**，易混淆点的**列表**在 `TMISSION.md`，避免两处重复。

## Template

```md
# LESSON-INTERACTION: {lesson topic}

## 学生已经会
- {prior knowledge this lesson builds on}

## 本课新内容
- {KP-xxx} {new idea or skill}

## 易混淆点（配区分问题）
- {KP-xxx} {A} vs {B}
  - 区分问题: {a question that exposes the confusion}
  - 正确表现: {what mastery sounds like}

## 本课任务或作业
- {task the student completes}

## 成功证据
- {observable evidence that this lesson landed}

## 老师端输入
- 来源: {PDF, URL, uploaded file, interface payload}
- 用途: {what the AI should do with it}
```

## Rules

- The lesson file is the only place lesson content lives. Do not ask questions from model memory when the lesson file covers the topic.
- **每个混淆对必须配「区分问题」** —— 没有区分问题，这个混淆点驱动不了对话。
- 混淆点的**列表本身**写在 `TMISSION.md`，本文件只补充区分问题与正确表现。
- When a chunk or confusion pair maps to a stable knowledge point, include its `KP-xxx` id so mastery can attach to the teacher directory.
- Teacher input stays in this file with its source so later state updates can cite where the material came from.

## 什么是「区分问题」

**区分问题 = 专门用来分辨"学生到底有没有把 A 和 B 搞混"的那一道题。**

| | 普通检测问题 | 区分问题 |
| --- | --- | --- |
| 问什么 | "你会不会" | "你会不会搞混 A 和 B" |
| 结果 | 答对 / 答错 | **精确暴露误解位置** |
| 用途 | 验证知识点掌握 | 检验两个知识点的边界 |

**示例：**

| 要素 | 内容 |
| --- | --- |
| 易混淆点 | 高级调度（作业调度） vs 低级调度（进程调度） |
| 区分问题 | 外存里的作业变成内存里能上 CPU 的进程，中间经过哪几级调度？谁把作业调进来、谁决定谁上 CPU？ |
| 正确表现 | 能分别说出：高级调度把作业调入内存创建进程，低级调度从就绪进程里选一个上 CPU |

> 混淆的学生**一定会在"谁把作业调进来"这一步说错**。区分问题的设计目的就是逼出那个错误，让 AI 能判定"他这里混了"，从而决定是追问、给提示，还是换例子。
