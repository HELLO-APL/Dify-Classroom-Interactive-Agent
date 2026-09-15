# LESSON-INTERACTION Format

`LESSON-INTERACTION.md` stores the current lesson the AI will interact around. It is the grounded content source: questions and explanations trace back here.

## Template

```md
# LESSON-INTERACTION: {lesson topic}

## 学生已经会
- {prior knowledge this lesson builds on}

## 本课新内容
- {KP-xxx} {new idea or skill}

## 易混淆点
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
- Confusion pairs need a distinction question. A pair without a question cannot drive dialogue.
- When a chunk or confusion pair maps to a stable knowledge point, include its `KP-xxx` id so mastery can attach to the teacher directory.
- Teacher input stays in this file with its source so later state updates can cite where the material came from.
