# DIALOGUE-LOG Format

`DIALOGUE-LOG.md` is the current session control block. Raw student and AI messages live in `student-workspace/data/dialogue-log.json`; mastery lives in `mastery-state.json` and `mastery-history.json`.

## Template

```md
# DIALOGUE-LOG

## 会话状态
- student_id: {student id}
- speaker: {host | student}
- host_phase: {uninitialized | intro | lecturing | segment_summary | point_review | ending}
- active_segment_id: {segment id or 无}
- phase: {未初始化 | dialogue | ended}
- current_target: {difficulty | confusion pair | marker point}
- current_question: {exact open question or 无}
- attempts: {number}
- mastered: {session targets closed by evidence}
- unresolved: {session targets still open}
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

## Rules

- Record session control and evidence here, not every message.
- Raw dialogue must be appended to `dialogue-log.json`, not duplicated here.
- Mastery changes must go to `mastery-state.json` and `mastery-history.json`, not be stored here as the source of truth.
- `mastered` and `unresolved` here describe this session's targets only; they are not the global mastery profile.
- `???` increments `wait_what_used`.
- If a question source cannot be named, do not write it as grounded evidence.
- The next focus must point back to a teacher mission, lesson file, class point, or knowledge point.
