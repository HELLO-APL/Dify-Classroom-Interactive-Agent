-- teach 课堂互动智能体：完整数据库模型参考
-- 类型按目标数据库调整；JSON 在 PostgreSQL 可换成 JSONB。

CREATE TABLE teacher (
    teacher_id          VARCHAR(64) PRIMARY KEY,
    display_name        VARCHAR(100) NOT NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE student (
    student_id          VARCHAR(64) PRIMARY KEY,
    display_name        VARCHAR(100) NOT NULL,
    teacher_id          VARCHAR(64) NULL,
    constraints_json    JSON NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lesson (
    lesson_id           VARCHAR(64) PRIMARY KEY,
    teacher_id          VARCHAR(64) NOT NULL,
    course_name         VARCHAR(200) NOT NULL,
    lesson_no           VARCHAR(100) NULL,
    title               VARCHAR(300) NOT NULL,
    hours               NUMERIC(4,1) NULL,
    summary             TEXT NULL,
    status              VARCHAR(30) NOT NULL DEFAULT 'preparing',
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE knowledge_point (
    kp_id               VARCHAR(64) PRIMARY KEY,
    course_name         VARCHAR(200) NOT NULL,
    parent_kp_id        VARCHAR(64) NULL,
    title               VARCHAR(300) NOT NULL,
    definition          TEXT NULL,
    detection_question  TEXT NULL,
    mastery_criteria    TEXT NULL,
    order_index         INTEGER NOT NULL DEFAULT 0,
    status              VARCHAR(30) NOT NULL DEFAULT 'active',
    version             VARCHAR(50) NOT NULL DEFAULT '1',
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lesson_segment (
    segment_id          VARCHAR(64) PRIMARY KEY,
    lesson_id           VARCHAR(64) NOT NULL,
    title               VARCHAR(300) NOT NULL,
    order_index         INTEGER NOT NULL DEFAULT 0,
    summary             TEXT NULL,
    content             TEXT NULL,
    source_course       VARCHAR(200) NULL,
    source_slide        VARCHAR(200) NULL,
    source_position     VARCHAR(500) NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE segment_knowledge_point (
    segment_id          VARCHAR(64) NOT NULL,
    kp_id               VARCHAR(64) NOT NULL,
    PRIMARY KEY (segment_id, kp_id)
);

CREATE TABLE teacher_mission (
    mission_id          VARCHAR(64) PRIMARY KEY,
    lesson_id           VARCHAR(64) NOT NULL UNIQUE,
    rationale           TEXT NULL,
    class_goals_json    JSON NULL,
    core_difficulties_json JSON NULL,
    confusion_pairs_json JSON NULL,
    required_outputs_json JSON NULL,
    no_ai_answers_json  JSON NULL,
    version             INTEGER NOT NULL DEFAULT 1,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE student_mission (
    mission_id          VARCHAR(64) PRIMARY KEY,
    student_id          VARCHAR(64) NOT NULL,
    lesson_id           VARCHAR(64) NOT NULL,
    goal                TEXT NULL,
    success_criteria_json JSON NULL,
    interest_hooks_json JSON NULL,
    next_step           TEXT NULL,
    constraints_json    JSON NULL,
    version             INTEGER NOT NULL DEFAULT 1,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (student_id, lesson_id, version)
);

CREATE TABLE lesson_interaction (
    interaction_id      VARCHAR(64) PRIMARY KEY,
    lesson_id           VARCHAR(64) NOT NULL UNIQUE,
    title               VARCHAR(300) NOT NULL,
    prior_knowledge_json JSON NULL,
    new_content_json    JSON NULL,
    confusion_pairs_json JSON NULL,
    tasks_json          JSON NULL,
    success_evidence_json JSON NULL,
    teacher_material_refs_json JSON NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE teaching_session (
    session_id          VARCHAR(128) PRIMARY KEY,
    student_id          VARCHAR(64) NOT NULL,
    lesson_id           VARCHAR(64) NOT NULL,
    phase               VARCHAR(30) NOT NULL DEFAULT '未初始化',
    host_phase          VARCHAR(30) NOT NULL DEFAULT 'uninitialized',
    active_segment_id   VARCHAR(64) NULL,
    speaker             VARCHAR(30) NULL,
    current_target      TEXT NULL,
    current_question    TEXT NULL,
    attempts            INTEGER NOT NULL DEFAULT 0,
    mastered_json       JSON NULL,
    unresolved_json     JSON NULL,
    student_status      VARCHAR(30) NOT NULL DEFAULT 'active',
    wait_what_used      INTEGER NOT NULL DEFAULT 0,
    research_used       INTEGER NOT NULL DEFAULT 0,
    help_used           INTEGER NOT NULL DEFAULT 0,
    inactivity_step     INTEGER NOT NULL DEFAULT 0,
    focus_bundle_json   JSON NULL,
    started_at          TIMESTAMP NULL,
    ended_at            TIMESTAMP NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dialogue_message (
    message_id          BIGINT PRIMARY KEY AUTO_INCREMENT,
    session_id          VARCHAR(128) NOT NULL,
    student_id          VARCHAR(64) NOT NULL,
    lesson_id           VARCHAR(64) NOT NULL,
    speaker             VARCHAR(30) NOT NULL,
    message_type        VARCHAR(30) NOT NULL,
    command             VARCHAR(50) NULL,
    content             TEXT NOT NULL,
    knowledge_point_id  VARCHAR(64) NULL,
    source              VARCHAR(30) NOT NULL DEFAULT 'chat',
    evidence            TEXT NULL,
    meta_json           JSON NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE class_point (
    point_id            VARCHAR(64) PRIMARY KEY,
    student_id          VARCHAR(64) NOT NULL,
    lesson_id           VARCHAR(64) NOT NULL,
    segment_id          VARCHAR(64) NOT NULL,
    knowledge_point_id  VARCHAR(64) NULL,
    session_id          VARCHAR(128) NULL,
    type                VARCHAR(30) NOT NULL DEFAULT 'marker',
    mark_level          VARCHAR(30) NOT NULL,
    reason_tags_json    JSON NULL,
    student_note        TEXT NULL,
    content             TEXT NULL,
    source_link         VARCHAR(1000) NULL,
    status              VARCHAR(30) NOT NULL DEFAULT 'open',
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mastery_state (
    student_id          VARCHAR(64) NOT NULL,
    kp_id               VARCHAR(64) NOT NULL,
    stars               INTEGER NOT NULL DEFAULT 0 CHECK (stars BETWEEN 0 AND 5),
    status              VARCHAR(30) NOT NULL DEFAULT '未检测',
    assessment_status   VARCHAR(30) NOT NULL DEFAULT '未考核',
    annotation_ids_json JSON NOT NULL DEFAULT '[]',
    last_annotation_id  VARCHAR(64) NULL,
    last_source         VARCHAR(30) NULL,
    last_evidence       TEXT NULL,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (student_id, kp_id)
);

CREATE TABLE mastery_history (
    history_id          BIGINT PRIMARY KEY AUTO_INCREMENT,
    student_id          VARCHAR(64) NOT NULL,
    kp_id               VARCHAR(64) NOT NULL,
    old_stars           INTEGER NOT NULL,
    new_stars           INTEGER NOT NULL,
    old_status          VARCHAR(30) NOT NULL,
    new_status          VARCHAR(30) NOT NULL,
    source              VARCHAR(30) NOT NULL,
    evidence            TEXT NULL,
    annotation_id       VARCHAR(64) NULL,
    session_id          VARCHAR(128) NULL,
    message_id          BIGINT NULL,
    occurred_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE note (
    note_id             BIGINT PRIMARY KEY AUTO_INCREMENT,
    student_id          VARCHAR(64) NOT NULL,
    lesson_id           VARCHAR(64) NULL,
    category            VARCHAR(30) NOT NULL DEFAULT 'observation',
    content             TEXT NOT NULL,
    created_by          VARCHAR(30) NOT NULL DEFAULT 'ai',
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE glossary_term (
    term_id             BIGINT PRIMARY KEY AUTO_INCREMENT,
    student_id          VARCHAR(64) NOT NULL,
    kp_id               VARCHAR(64) NULL,
    lesson_id           VARCHAR(64) NULL,
    term                VARCHAR(200) NOT NULL,
    definition          TEXT NOT NULL,
    avoid_aliases_json  JSON NULL,
    status              VARCHAR(30) NOT NULL DEFAULT 'candidate',
    evidence_message_id BIGINT NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (student_id, term)
);

CREATE TABLE learning_record (
    record_id           BIGINT PRIMARY KEY AUTO_INCREMENT,
    student_id          VARCHAR(64) NOT NULL,
    lesson_id           VARCHAR(64) NULL,
    title               VARCHAR(300) NOT NULL,
    content             TEXT NOT NULL,
    evidence_json       JSON NULL,
    implications_json   JSON NULL,
    status              VARCHAR(30) NOT NULL DEFAULT 'active',
    superseded_by       BIGINT NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE classroom_event (
    event_id            VARCHAR(64) PRIMARY KEY,
    lesson_id           VARCHAR(64) NOT NULL,
    session_id          VARCHAR(128) NOT NULL,
    event_type          VARCHAR(50) NOT NULL,
    segment_id          VARCHAR(64) NULL,
    actor               VARCHAR(30) NOT NULL,
    payload_json        JSON NULL,
    occurred_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE teacher_material (
    material_id         BIGINT PRIMARY KEY AUTO_INCREMENT,
    lesson_id           VARCHAR(64) NOT NULL,
    source_type         VARCHAR(30) NOT NULL,
    original_name       VARCHAR(300) NULL,
    storage_url         VARCHAR(1000) NULL,
    extracted_text      TEXT NULL,
    source_note         TEXT NULL,
    added_by            VARCHAR(64) NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE uploaded_file (
    file_id             BIGINT PRIMARY KEY AUTO_INCREMENT,
    session_id          VARCHAR(128) NULL,
    student_id          VARCHAR(64) NOT NULL,
    lesson_id           VARCHAR(64) NULL,
    original_name       VARCHAR(300) NOT NULL,
    mime_type           VARCHAR(100) NULL,
    storage_url         VARCHAR(1000) NULL,
    extracted_text      TEXT NULL,
    extract_status      VARCHAR(30) NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE resource (
    resource_id         BIGINT PRIMARY KEY AUTO_INCREMENT,
    lesson_id           VARCHAR(64) NULL,
    title               VARCHAR(300) NOT NULL,
    url_or_path         VARCHAR(1000) NOT NULL,
    use_for             TEXT NULL,
    resource_type       VARCHAR(30) NOT NULL DEFAULT 'knowledge',
    added_by            VARCHAR(30) NOT NULL DEFAULT 'teacher',
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE research_request (
    request_id          BIGINT PRIMARY KEY AUTO_INCREMENT,
    session_id          VARCHAR(128) NOT NULL,
    student_id          VARCHAR(64) NOT NULL,
    query               TEXT NOT NULL,
    status              VARCHAR(30) NOT NULL DEFAULT 'placeholder',
    result_text         TEXT NULL,
    sources_json        JSON NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rule_document (
    rule_id             BIGINT PRIMARY KEY AUTO_INCREMENT,
    rule_name           VARCHAR(200) NOT NULL,
    original_path       VARCHAR(500) NULL,
    content_markdown    TEXT NOT NULL,
    version             VARCHAR(50) NOT NULL DEFAULT '1',
    read_only           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_student_teacher ON student(teacher_id);
CREATE INDEX idx_lesson_teacher ON lesson(teacher_id);
CREATE INDEX idx_kp_course ON knowledge_point(course_name, order_index);
CREATE INDEX idx_segment_lesson ON lesson_segment(lesson_id, order_index);
CREATE INDEX idx_session_student_lesson ON teaching_session(student_id, lesson_id, host_phase);
CREATE INDEX idx_message_session_time ON dialogue_message(session_id, created_at);
CREATE INDEX idx_message_student_kp ON dialogue_message(student_id, knowledge_point_id);
CREATE INDEX idx_class_point_segment_status ON class_point(lesson_id, segment_id, status);
CREATE INDEX idx_class_point_student ON class_point(student_id, created_at);
CREATE INDEX idx_mastery_state_student ON mastery_state(student_id, status);
CREATE INDEX idx_mastery_history_student_time ON mastery_history(student_id, occurred_at);
CREATE INDEX idx_note_student ON note(student_id, created_at);
CREATE INDEX idx_glossary_student ON glossary_term(student_id);
CREATE INDEX idx_learning_record_student ON learning_record(student_id, created_at);
CREATE INDEX idx_classroom_event_session ON classroom_event(session_id, occurred_at);
CREATE INDEX idx_teacher_material_lesson ON teacher_material(lesson_id);
CREATE INDEX idx_uploaded_file_session ON uploaded_file(session_id);
CREATE INDEX idx_research_request_session ON research_request(session_id);
