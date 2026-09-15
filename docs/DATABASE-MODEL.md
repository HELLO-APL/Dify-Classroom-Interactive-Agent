# teach 项目数据模型

更新时间：2026-09-11  
用途：给系统架构/数据库同学设计数据库、接口和学生 workspace 使用。本文描述当前项目真实使用、读写和未来接口需要的数据，不要求页面实现。

## 1. 数据域

| 数据域 | 内容 | 当前来源 |
| --- | --- | --- |
| 课程与规则 | 老师规则、知识点目录、课程片段 | `class agent`、`class-point/segments` |
| 课堂任务 | TMISSION、SMISSION、LESSON-INTERACTION | `teach test` |
| 课堂运行 | 当前 phase、主持人状态、当前问题、尝试次数 | `teach test/DIALOGUE-LOG.md` |
| 学生标记 | 上课时标记的问题、标签、来源链接、处理状态 | `class-point/points` |
| 掌握状态 | 每个学生每个知识点的当前状态 | `student-workspace/data/mastery-state.json` |
| 掌握历史 | 每次状态变化、证据、时间 | `student-workspace/data/mastery-history.json` |
| 对话记录 | 学生、主持人、AI 的完整问答 | `student-workspace/data/dialogue-log.json` |
| 长期记录 | notes、glossary、learning-record | `teach test`、学生 workspace |
| 材料与资源 | 老师上传材料、学生上传文件、可信资源 | `teacher_material`、上传文件、资源文件 |

## 2. 实体关系概览

```text
teacher 1 ── N lesson
lesson  1 ── N lesson_segment
lesson  1 ── 1 teacher_mission
lesson  1 ── 1 lesson_interaction
student 1 ── N student_mission
student 1 ── N teaching_session
student 1 ── N class_point
student 1 ── N mastery_state
student 1 ── N mastery_history
student 1 ── N dialogue_message
student 1 ── N note
student 1 ── N glossary_term
student 1 ── N learning_record

lesson_segment N ── M knowledge_point
class_point N ── 1 lesson_segment
class_point N ── 0..1 knowledge_point
class_point N ── 1 student
teaching_session 1 ── N dialogue_message
mastery_state 1 ── N mastery_history
```

## 3. 枚举与状态

### 3.1 课堂阶段

```text
host_phase:
  uninitialized
  intro
  lecturing
  segment_summary
  point_review
  ending
```

### 3.2 会话状态

```text
phase:
  未初始化
  dialogue
  ended

student_status:
  active
  practicing
  waiting
  ended
```

### 3.3 掌握星级

```text
0 星  未检测，前端不显示星星
1 星  已标注
2 星  初步理解
3 星  理解中
4 星  接近掌握
5 星  已掌握，只能由正式考核通过产生
```

标注只负责提供学习线索和 1 星起点；答疑证据可以把星级提升到 2-4 星；不能由标注直接产生 5 星。

### 3.4 标记与标签

```text
mark_level:
  掌握
  没掌握

reason_tags:
  完全不懂
  没有听到
  部分理解
  自定义标签

class_point.status:
  open
  已解决
  延后
```

### 3.5 消息类型

```text
speaker:
  host
  student
  assistant
  system

message_type:
  host_event
  student_question
  point_selection
  answer
  command
  help
  research
  system
```

## 4. 表设计

### 4.1 `teacher`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `teacher_id` | varchar | 老师 ID |
| `display_name` | varchar | 显示名称 |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 更新时间 |

### 4.2 `student`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `student_id` | varchar | 学生 ID，当前 `student-001` |
| `display_name` | varchar | 显示名称 |
| `teacher_id` | varchar | 所属老师 |
| `constraints` | text/json | 时间、注意力、偏好等 |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 更新时间 |

### 4.3 `lesson`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `lesson_id` | varchar | 课时 ID，如 `ch3-process-scheduling` |
| `teacher_id` | varchar | 老师 ID |
| `course_name` | varchar | 课程名 |
| `lesson_no` | varchar | 章节/课时编号 |
| `title` | varchar | 标题 |
| `hours` | decimal | 学时 |
| `summary` | text | 简介 |
| `status` | varchar | preparing/active/ended |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 更新时间 |

### 4.4 `knowledge_point`

老师维护的稳定知识点目录，一学期内编号不变。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `kp_id` | varchar | 知识点 ID，如 `KP-002` |
| `course_name` | varchar | 所属课程 |
| `parent_kp_id` | varchar/null | 父知识点，可为空 |
| `title` | varchar | 知识点标题 |
| `definition` | text | 定义 |
| `detection_question` | text | 检测问题 |
| `mastery_criteria` | text | 掌握表现/标准 |
| `order_index` | int | 排序 |
| `status` | varchar | active/archived |
| `version` | varchar | 目录版本 |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 更新时间 |

### 4.5 `lesson_segment`

课件播放片段，必须可回到原始位置。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `segment_id` | varchar | 片段 ID，如 `seg-002` |
| `lesson_id` | varchar | 所属课时 |
| `title` | varchar | 片段标题 |
| `order_index` | int | 播放顺序 |
| `summary` | text | 片段摘要 |
| `content` | text | 答疑用的小块内容 |
| `source_course` | varchar | 来源课程 |
| `source_slide` | varchar | 来源课件/页码 |
| `source_position` | varchar | 原始视频进度/链接 |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 更新时间 |

### 4.6 `segment_knowledge_point`

片段与知识点是多对多关系。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `segment_id` | varchar | 片段 ID |
| `kp_id` | varchar | 知识点 ID |

联合主键：`(segment_id, kp_id)`。

### 4.7 `teacher_mission`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `mission_id` | varchar | ID |
| `lesson_id` | varchar | 课时 |
| `rationale` | text | 老师为什么设置这节课 |
| `class_goals` | json | 全班共同目标 |
| `core_difficulties` | json | 难点、答对证据、易错表现 |
| `confusion_pairs` | json | 易混淆点，A vs B |
| `required_outputs` | json | 学生必须主动说出或做出 |
| `no_ai_answers` | json | 不允许 AI 代答的内容 |
| `version` | int | 版本 |
| `updated_at` | timestamp | 更新时间 |

### 4.8 `student_mission`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `mission_id` | varchar | ID |
| `student_id` | varchar | 学生 |
| `lesson_id` | varchar | 课时 |
| `goal` | text | 学生目标 |
| `success_criteria` | json | 成功表现 |
| `interest_hooks` | json | 兴趣钩子 |
| `next_step` | text | 最接近的下一步 |
| `constraints` | json | 约束 |
| `version` | int | 版本 |
| `updated_at` | timestamp | 更新时间 |

### 4.9 `lesson_interaction`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `interaction_id` | varchar | ID |
| `lesson_id` | varchar | 课时 |
| `title` | varchar | 标题 |
| `prior_knowledge` | json | 学生已会 |
| `new_content` | json | 本课新内容 |
| `confusion_pairs` | json | 易混淆点、区分问题、正确表现 |
| `tasks` | json | 任务/作业 |
| `success_evidence` | json | 成功证据 |
| `teacher_material_refs` | json | 老师材料引用 |
| `updated_at` | timestamp | 更新时间 |

### 4.10 `teaching_session`

一次课堂 session，DIALOGUE-LOG 的结构化版本。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `session_id` | varchar | Chat session ID |
| `student_id` | varchar | 学生 |
| `lesson_id` | varchar | 课时 |
| `phase` | varchar | 未初始化/dialogue/ended |
| `host_phase` | varchar | 主持人阶段 |
| `active_segment_id` | varchar | 当前片段 |
| `speaker` | varchar | 当前说话者 |
| `current_target` | text | 当前目标 |
| `current_question` | text | 当前问题 |
| `attempts` | int | 当前题尝试次数 |
| `mastered` | json | 本会话中已关闭目标 |
| `unresolved` | json | 本会话中未解决目标 |
| `student_status` | varchar | active/practicing/waiting/ended |
| `wait_what_used` | int | `???` 使用次数 |
| `research_used` | int | `/research` 次数 |
| `help_used` | int | `/帮助` 次数 |
| `inactivity_step` | int | 未回应阶梯 |
| `focus_bundle` | json | 本场 focus bundle |
| `started_at` | timestamp | 开始时间 |
| `ended_at` | timestamp | 结束时间 |
| `updated_at` | timestamp | 更新时间 |

### 4.11 `dialogue_message`

长期完整问答记录。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `message_id` | bigint | 自增 ID |
| `session_id` | varchar | 会话 |
| `student_id` | varchar | 学生 |
| `lesson_id` | varchar | 课时 |
| `speaker` | varchar | host/student/assistant/system |
| `message_type` | varchar | 消息类型 |
| `command` | varchar/null | 命令 |
| `content` | text | 原始内容 |
| `knowledge_point_id` | varchar/null | 关联知识点 |
| `source` | varchar | chat/dialogue/manual/interface |
| `evidence` | text/null | 证据摘要 |
| `meta_json` | json | 附加信息 |
| `created_at` | timestamp | 时间 |

### 4.12 `mastery_state`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `student_id` | varchar | 学生 |
| `kp_id` | varchar | 知识点 |
| `stars` | int | 0-5 星 |
| `status` | varchar | 未检测/已标注/初步理解/理解中/接近掌握/已掌握 |
| `assessment_status` | varchar | 未考核/考核中/已通过 |
| `annotation_ids` | json | 关联的 class_point |
| `last_annotation_id` | varchar/null | 最近一条标注 |
| `last_source` | varchar | knowledge_base/class_point/dialogue/assessment/manual |
| `last_evidence` | text | 最近证据 |
| `updated_at` | timestamp | 更新时间 |

联合主键：`(student_id, kp_id)`。

### 4.13 `mastery_history`

每次状态变化追加一条，不覆盖。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `history_id` | bigint | 自增 ID |
| `student_id` | varchar | 学生 |
| `kp_id` | varchar | 知识点 |
| `old_stars` | int | 旧星级 |
| `new_stars` | int | 新星级 |
| `old_status` | varchar | 旧状态 |
| `new_status` | varchar | 新状态 |
| `source` | varchar | class_point/dialogue/assessment/manual |
| `evidence` | text | 证据 |
| `annotation_id` | varchar/null | 对应标注 |
| `session_id` | varchar | 对应会话 |
| `message_id` | bigint/null | 对应消息 |
| `occurred_at` | timestamp | 发生时间 |

### 4.14 `class_point`

学生上课标记或课堂提问。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `point_id` | varchar | 标记点 ID |
| `student_id` | varchar | 学生 |
| `lesson_id` | varchar | 课时 |
| `segment_id` | varchar | 所属片段 |
| `knowledge_point_id` | varchar/null | 关联稳定知识点 KP-xxx |
| `session_id` | varchar/null | 产生会话 |
| `type` | varchar | marker/question |
| `mark_level` | varchar | 掌握/没掌握 |
| `reason_tags` | json | 完全不懂/没有听到/部分理解/自定义 |
| `student_note` | text | 学生备注 |
| `content` | text/null | 提问内容 |
| `source_link` | varchar | 回到原始位置 |
| `status` | varchar | open/已解决/延后 |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 更新时间 |

### 4.15 `note`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `note_id` | bigint | ID |
| `student_id` | varchar | 学生 |
| `lesson_id` | varchar/null | 课时 |
| `category` | varchar | preference/observation/working |
| `content` | text | 内容 |
| `created_by` | varchar | teacher/student/ai |
| `created_at` | timestamp | 时间 |

### 4.16 `glossary_term`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `term_id` | bigint | ID |
| `student_id` | varchar | 学生 |
| `kp_id` | varchar/null | 知识点 |
| `lesson_id` | varchar/null | 课时 |
| `term` | varchar | 标准词 |
| `definition` | text | 定义 |
| `avoid_aliases` | json | 需要避免的模糊说法 |
| `status` | varchar | candidate/confirmed |
| `evidence_message_id` | bigint/null | 证据消息 |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 更新时间 |

### 4.17 `learning_record`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `record_id` | bigint | ID |
| `student_id` | varchar | 学生 |
| `lesson_id` | varchar/null | 课时 |
| `title` | varchar | 标题 |
| `content` | text | 内容 |
| `evidence` | json | 证据 |
| `implications` | json | 对未来教学的影响 |
| `status` | varchar | active/superseded |
| `superseded_by` | bigint/null | 被哪条替代 |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 更新时间 |

### 4.18 `classroom_event`

主持人/视频系统事件接口。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `event_id` | varchar | 事件 ID |
| `lesson_id` | varchar | 课时 |
| `session_id` | varchar | 会话 |
| `event_type` | varchar | lesson_start/segment_start/segment_end/lesson_end |
| `segment_id` | varchar/null | 片段 |
| `actor` | varchar | host/platform/system |
| `payload` | json | 接口原始数据 |
| `occurred_at` | timestamp | 发生时间 |

### 4.19 辅助表

- `teacher_material`：老师上传或接口传入的材料。
- `uploaded_file`：学生本轮上传文件。
- `resource`：可信参考资源。
- `research_request`：`/research` 请求和结果。
- `rule_document`：可选，若要连规则文件也入库则使用。

## 5. 当前文件到数据库表的映射

| 当前文件 | 目标表 |
| --- | --- |
| `class agent/KNOWLEDGE-BASE.md` | `knowledge_point` |
| `class-point/segments/*.json` | `lesson_segment`、`segment_knowledge_point` |
| `class-point/points/*.json` | `class_point` |
| `teach test/TMISSION.md` | `teacher_mission` |
| `teach test/SMISSION.md` | `student_mission` |
| `teach test/LESSON-INTERACTION.md` | `lesson_interaction` |
| `teach test/DIALOGUE-LOG.md` | `teaching_session` |
| `teach test/NOTES.md` | `note` |
| `teach test/GLOSSARY.md` | `glossary_term` |
| `teach test/LEARNING-RECORD.md` | `learning_record` |
| `student-workspace/data/mastery-state.json` | `mastery_state` |
| `student-workspace/data/mastery-history.json` | `mastery_history` |
| `student-workspace/data/dialogue-log.json` | `dialogue_message` |

## 6. 读写边界

| 数据 | 读取者 | 写入者 |
| --- | --- | --- |
| 老师规则/知识点 | 工作流、学生 workspace 只读 | 老师/管理后台 |
| 课堂任务 | 工作流 | 老师上传、老师后台 |
| 当前会话 | 工作流、学生 workspace | 工作流 |
| 标记点 | 工作流、学生 workspace | 学生、工作流 |
| 掌握状态 | 工作流、学生 workspace | 工作流、学生手动修改 |
| 掌握历史 | 学生 workspace | 工作流，只追加 |
| 对话记录 | 学生 workspace | 工作流，只追加 |

## 7. 还没接接口的数据

- `source_link`：当前为本地样例，正式来源由视频/平台接口提供。
- `teacher_material`：网站、PDF、接口数据尚未真实接入。
- `classroom_event`：当前用 Chat 命令模拟，正式版本接平台事件。
- `research_request`：当前只有占位逻辑。
