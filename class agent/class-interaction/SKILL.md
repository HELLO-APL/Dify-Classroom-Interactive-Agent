---
name: class-interaction
description: "Run one host-led class session for one student: manage lesson phases, markers, mastery state, and evidence-backed state-file updates."
disable-model-invocation: true
argument-hint: "开始一节课堂互动"
---

# Class Interaction

One class session, one student, one host-led rhythm. The agent keeps the class on the teacher's mission and leaves every data store better informed than it found them.

## Load before acting

Read before the first turn:

- `class agent` rule docs and `KNOWLEDGE-BASE.md`: teacher-owned, read-only.
- `class-interaction/MASTERY-STAR-RULES.md`: the only rule set for converting annotations, dialogue evidence, and assessments into 0-5 star mastery.
- `teach test` state files: current session control and lesson state.
- `class-point/segments`: small knowledge chunks tied to the lesson.
- `class-point/points`: student markers.
- `student-workspace/data/mastery-state.json` and `mastery-history.json`: current and past mastery, read when the workspace layer is present.
- `student-workspace/data/dialogue-log.json`: full student/AI messages, read when the workspace layer is present.

If teacher goals or lesson state are missing, name them and wait. If `KNOWLEDGE-BASE.md` or the workspace data layer is missing, keep teaching but do not invent knowledge point IDs or mastery history.

## Control the class rhythm

Keep `host_phase` and `active_segment_id` in `DIALOGUE-LOG.md`:

- `uninitialized`: nothing has started.
- `intro`: host opened the class.
- `lecturing`: a segment is playing.
- `segment_summary`: a segment ended and markers are listed.
- `point_review`: one marker is being taught.
- `ending`: host closed the class.

Route host events:

- Class start: introduce goals, no question.
- Segment play: set `active_segment_id`, no question.
- Segment end: summarize the segment, list open markers for that segment, ask the student to choose one.
- Class end: summarize the class and run the end-of-session update.

Handle the student `继续` event only while `host_phase=point_review`:

- With confirmed learning evidence, set the current marker to `已解决`.
- Without confirmed evidence, set it to `延后`; `继续` itself is not evidence.
- Write `current_question: 无`, `host_flow: next_step_requested`, and `speaker: host`.
- Return control to the host, whose reply must be exactly `当前标记点已处理结束，准备进入下一段。`
- Do not list other open markers, ask another question, or prompt the student to mark anything.
- Outside `point_review`, `继续` does not advance the video or class flow.

Host events are handled here, not by `../dialogue/SKILL.md`. Dialogue handles student turns only.

While `lecturing`, student questions are markers, not conversation turns: do not answer or evaluate. Write a class point and wait until the segment ends.

After the student picks a marker, hand the turn to `../dialogue/SKILL.md` for `point_review`.

## Update with one source of truth

Write by event, never by habit:

- Every turn: update session control in `DIALOGUE-LOG.md`.
- Every student/AI exchange: append to `dialogue-log.json` when the workspace layer is present.
- New or changed marker: update `class-point/points`; link it to a stable `KP-xxx` whenever the segment and knowledge-base entry allow it.
- Annotation mastery floor: a valid linked marker changes an untouched knowledge point from 0 stars to at least 1 star.
- Mastery evidence: update `mastery-state.json` and append to `mastery-history.json` using `old_stars/new_stars`, `source`, and evidence. Only a passed assessment may create 5 stars.
- End of class only: update `SMISSION.md`, `NOTES.md`, `GLOSSARY.md`, `LEARNING-RECORD.md`, and set `phase` to `ended`.

Teacher-owned files stay read-only unless the teacher uploads a replacement.

## End the session

End only after `/结束` or host class end. Summarize evidence-backed changes, update the state files named above, and reply with a short closing summary.

## Completion criteria

The session is complete only when:

- every update is evidence-backed and written to its intended store;
- mastery history preserves every change with old stars, new stars, source, and evidence;
- raw dialogue is appended, not summarized away;
- session control reflects the final phase;
- the student received the closing summary.
