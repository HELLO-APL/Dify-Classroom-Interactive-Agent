# TMISSION Format

`TMISSION.md` stores the teacher/class mission for the current lesson. One mission per lesson, shared by the whole class.

## Template

```md
# TMISSION: {lesson or topic}

## 老师为什么设置这节课
{the real classroom outcome the teacher wants}

## 全班共同目标
- {observable outcome}

## 核心难点
- {KP-xxx} {difficulty}
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
- Every difficulty entry must carry both evidence and error shape so the dialogue skill can recognize progress.
- Tie each difficulty and confusion pair to a stable `KP-xxx` in `KNOWLEDGE-BASE.md` when the directory exists.
- Keep the file short enough to fit one lesson. Long curriculum plans belong elsewhere.
