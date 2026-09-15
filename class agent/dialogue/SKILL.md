---
name: dialogue
description: "Handle one student turn in an active class-interaction session: classify questions, marker choices, commands, and answers; route to the correct teaching behavior."
---

# Dialogue

This skill handles one student turn in an active class session. Host events are owned by `class-interaction`; do not route them here. Before acting, confirm `speaker`, `host_phase`, and `active_segment_id` are visible. If any is missing, name it and wait.

Read `class-interaction/MASTERY-STAR-RULES.md` before making any mastery update.

## Classify the turn

Route into exactly one branch:

- `???`: re-pitch the previous explanation in smaller steps, then run one short comprehension check. Do not add new material. Increment `wait_what_used`.
- `/research`: ask for the exact question if unclear; return a placeholder answer and say the source must be marked in the real product.
- `/帮助`: show the help menu and wait for the student's choice.
- Student question while `lecturing`: record a class point, do not answer, do not evaluate.
- Marker choice in `segment_summary`: open `point_review` for that point.
- Answer in `point_review`: evaluate it with the answer paths below.
- `继续` in `point_review`: close the current marker by evidence, return control to the host, and do not update mastery from `继续` alone.
- `/结束`: return the exit handoff and ask nothing new.
- New topic or off-task message: acknowledge in one sentence, note any interest, return to the current target.

## Help menu

Offer no more than six options:

1. 给一个提示，但不要讲完整答案
2. 换一个例子
3. 换一种说法重新讲
4. 讲慢一点，拆成更小的步骤
5. 先换一道更简单的题
6. 今天先到这里

Deliver only the chosen option, then continue from the updated session state.

## Answer paths

- Correct: confirm briefly, record evidence, update mastery, ask the next question.
- Partially correct: say which part is right, then isolate the missing piece.
- Wrong: give a hint first. Rephrase once if needed. After two failed attempts, change strategy or lower difficulty.
- Give a full explanation only when the student asks for it or says they are stuck.

## Mastery updates

Map the student's turn to a stable `KP-xxx` from `KNOWLEDGE-BASE.md` when possible.

Mastery uses the 0-5 star scale:

- 0 stars: 未检测; draw no stars in the student workspace.
- 1 star: 已标注; a valid linked marker exists.
- 2 stars: 初步理解.
- 3 stars: 理解中.
- 4 stars: 接近掌握.
- 5 stars: 已掌握; only a passed assessment may create this result.

Marker labels keep their existing meaning:

- 完全不懂: teach from the basics, but the linked marker still creates the 1-star floor.
- 没有听到: replay the core, but keep the 1-star floor.
- 部分理解: probe the missing piece; dialogue evidence may raise the rating to 2-4 stars.
- 掌握: light confirmation only; it does not create 5 stars.
- Custom labels: record them and evaluate after dialogue.

Mastery changes come from linked markers, dialogue evidence, assessments, or manual student edits. Every change appends an event with old stars, new stars, old status, new status, source, evidence, annotation link when available, and time. A marker label is self-report, not confirmed mastery.

## Update session state

After every meaningful turn:

- strong correct evidence closes the current target and opens the next unresolved one;
- two failed attempts switch strategy;
- `???` leads to a comprehension check;
- any help choice is counted;
- any student reply resets `inactivity_step` to 0.

When closing on `继续`:

- confirmed evidence closes the marker as `已解决`;
- no confirmed evidence closes it as `延后`;
- set `host_flow=next_step_requested`;
- clear `current_question`;
- do not ask another question;
- do not list any other open marker;
- return the fixed host reply `当前标记点已处理结束，准备进入下一段。`;
- do not advance the flow outside `point_review`.

## Handoff

Return to `class-interaction`:

- `command`: `continue` or `exit`
- `evidence`: concrete signals from this turn
- `session_state`: target, attempts, mastered, unresolved, wait/research/help counts
- `mastery_updates`: knowledge point star changes, or none
- `point_updates`: class-point status changes, or none
- `glossary_candidates`: terms evidenced this turn, or none
- `next_question`: one grounded next question, or none on exit
