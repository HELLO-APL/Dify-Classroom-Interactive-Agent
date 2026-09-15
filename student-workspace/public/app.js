const app = document.querySelector("#app");
const annotationDialog = document.querySelector("#annotationDialog");
const annotationForm = document.querySelector("#annotationForm");
const annotationError = document.querySelector("#annotationError");
const annotationTitle = document.querySelector("#annotationTitle");
const annotationCourse = document.querySelector("#annotationCourse");
const annotationKnowledgePoint = document.querySelector("#annotationKnowledgePoint");
const studentName = document.querySelector("#studentName");
const toast = document.querySelector("#toast");

const STAR_STATUS = {
  0: "未检测",
  1: "已标注",
  2: "初步理解",
  3: "理解中",
  4: "接近掌握",
  5: "已掌握",
};

const ANNOTATION_STATUS = {
  open: "待处理",
  已解决: "已解决",
  延后: "延后",
};

let workspace = null;
let toastTimer = null;
const ui = {
  masteryCourseId: "",
  masteryTab: "current",
  reviewCourseId: "",
  reviewKnowledgePointId: "",
  annotationCourseId: "",
  annotationStatus: "",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseRoute() {
  const raw = location.hash.slice(1) || "courses";
  const [path, query = ""] = raw.split("?");
  const [name = "courses", id = ""] = path.split("/");
  return {
    name,
    id,
    params: new URLSearchParams(query),
  };
}

function getLesson(lessonId) {
  return workspace.lessons.find((lesson) => lesson.lesson_id === lessonId);
}

function getKnowledgePoint(kpId) {
  return workspace.knowledge_points.find((item) => item.kp_id === kpId);
}

function getLessonKnowledgePoints(lessonId) {
  return workspace.knowledge_points
    .filter((item) => item.lesson_id === lessonId)
    .sort((left, right) => left.order_index - right.order_index);
}

function getMasteryState(kpId) {
  return workspace.mastery_state.knowledge_points[kpId] || {
    kp_id: kpId,
    stars: 0,
    status: "未检测",
    assessment_status: "未考核",
    annotation_ids: [],
    last_evidence: "",
    updated_at: null,
  };
}

function getAnnotationsForKnowledgePoint(kpId) {
  return workspace.annotations
    .filter((annotation) => annotation.knowledge_point_id === kpId)
    .sort((left, right) =>
      String(right.created_at || "").localeCompare(String(left.created_at || "")),
    );
}

function formatDate(value, options = {}) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: options.dateOnly ? undefined : "2-digit",
    minute: options.dateOnly ? undefined : "2-digit",
  }).format(date);
}

function statusTone(stars) {
  if (stars === 0) return "unassessed";
  if (stars === 1) return "annotated";
  if (stars === 5) return "mastered";
  return "learning";
}

function starsMarkup(stars) {
  if (stars === 0) {
    return '<span class="unassessed-mark">未检测</span>';
  }

  const starsText = [1, 2, 3, 4, 5]
    .map(
      (index) =>
        `<span class="star ${index <= stars ? "filled" : ""}" aria-hidden="true">★</span>`,
    )
    .join("");
  return `<span class="stars" aria-label="${stars} 星">${starsText}<span class="unassessed-mark">${stars}/5</span></span>`;
}

function statusPill(stars) {
  return `<span class="status-pill" data-tone="${statusTone(stars)}">${STAR_STATUS[stars]}</span>`;
}

function annotationStatusPill(status) {
  const tone =
    status === "已解决" ? "resolved" : status === "延后" ? "delayed" : "open";
  return `<span class="status-pill" data-tone="${tone}">${
    ANNOTATION_STATUS[status] || status
  }</span>`;
}

function pageHeader(eyebrow, title, description, actions = "") {
  return `
    <header class="page-header">
      <div>
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(description)}</p>
      </div>
      ${actions ? `<div class="page-actions">${actions}</div>` : ""}
    </header>
  `;
}

function courseSelect({ id, value, label = "选择课程" }) {
  const options = workspace.lessons
    .map(
      (lesson) =>
        `<option value="${escapeHtml(lesson.lesson_id)}" ${
          lesson.lesson_id === value ? "selected" : ""
        }>${escapeHtml(lesson.course_name)} · ${escapeHtml(lesson.title)}</option>`,
    )
    .join("");
  return `
    <label for="${id}">${escapeHtml(label)}</label>
    <select id="${id}">
      ${options}
    </select>
  `;
}

function lessonStats(lesson) {
  const knowledgePoints = getLessonKnowledgePoints(lesson.lesson_id);
  const annotated = knowledgePoints.filter(
    (knowledgePoint) => getMasteryState(knowledgePoint.kp_id).stars > 0,
  ).length;
  const mastered = knowledgePoints.filter(
    (knowledgePoint) => getMasteryState(knowledgePoint.kp_id).stars === 5,
  ).length;
  return {
    total: knowledgePoints.length,
    annotated,
    mastered,
    progress: knowledgePoints.length
      ? Math.round((annotated / knowledgePoints.length) * 100)
      : 0,
  };
}

function renderCourseList() {
  const cards = workspace.lessons
    .map((lesson) => {
      const stats = lessonStats(lesson);
      return `
        <a class="course-card" href="#course/${escapeHtml(lesson.lesson_id)}">
          <div class="course-card-top">
            <span class="course-code">${escapeHtml(lesson.lesson_id)}</span>
            <i data-lucide="arrow-up-right" aria-hidden="true"></i>
          </div>
          <div>
            <h2>${escapeHtml(lesson.title)}</h2>
            <p>${escapeHtml(lesson.course_name)} · ${escapeHtml(lesson.summary)}</p>
          </div>
          <div>
            <div class="progress-track" aria-label="已标注知识点比例 ${stats.progress}%">
              <span style="width: ${stats.progress}%"></span>
            </div>
            <div class="course-stats">
              <div class="course-stat">
                <strong>${stats.total}</strong>
                <span>知识点</span>
              </div>
              <div class="course-stat">
                <strong>${stats.annotated}</strong>
                <span>已标注</span>
              </div>
              <div class="course-stat">
                <strong>${stats.mastered}</strong>
                <span>已掌握</span>
              </div>
            </div>
          </div>
        </a>
      `;
    })
    .join("");

  app.innerHTML = `
    ${pageHeader(
      "Course center",
      "我的课程",
      "从这里进入课堂。课程页面顶部预留视频播放位置，下方继续使用原来的课堂互动对话框。",
    )}
    <section class="course-grid">
      ${
        cards ||
        '<div class="empty-state"><p>知识库中暂时没有可显示课程。</p></div>'
      }
    </section>
  `;
}

function renderCourseDetail(route) {
  const lesson = getLesson(route.id) || workspace.lessons[0];
  if (!lesson) {
    renderEmpty("还没有课程", "请在 KNOWLEDGE-BASE.md 和课程片段中准备课程内容。");
    return;
  }

  const knowledgePoints = getLessonKnowledgePoints(lesson.lesson_id);
  const selectedPointId = route.params.get("point");
  const selectedPoint = selectedPointId
    ? knowledgePoints.find((knowledgePoint) => {
        const annotations = getAnnotationsForKnowledgePoint(knowledgePoint.kp_id);
        return (
          knowledgePoint.kp_id === selectedPointId ||
          annotations.some((annotation) => annotation.point_id === selectedPointId)
        );
      })
    : null;
  const stats = lessonStats(lesson);

  app.innerHTML = `
    <a class="back-link" href="#courses">
      <i data-lucide="chevron-left" aria-hidden="true"></i>
      返回课程中心
    </a>
    ${pageHeader(
      lesson.course_name,
      lesson.title,
      lesson.summary,
      `<button class="secondary-button" type="button" data-annotate-lesson="${escapeHtml(
        lesson.lesson_id,
      )}">
        <i data-lucide="bookmark-plus" aria-hidden="true"></i>
        标注知识点
      </button>`,
    )}
    <section class="video-placeholder" aria-label="视频播放位置占位">
      <div class="video-content">
        <span class="play-mark">
          <i data-lucide="play" aria-hidden="true"></i>
        </span>
        <h2>课程视频播放位置</h2>
        <p>此区域已经预留。接入视频地址后，课堂事件可以继续控制片段播放与段落结束。</p>
      </div>
    </section>
    <div class="course-meta">
      <span class="meta-chip">${stats.total} 个知识点</span>
      <span class="meta-chip">${stats.annotated} 个已标注</span>
      <span class="meta-chip">${stats.mastered} 个已掌握</span>
      ${
        selectedPoint
          ? `<span class="status-pill" data-tone="annotated">来自标注：${escapeHtml(
              selectedPoint.title,
            )}</span>`
          : ""
      }
    </div>
    <section>
      <div class="section-heading">
        <div>
          <h2>课堂互动</h2>
          <p>沿用原来的老师引导、标记点答疑与语音播报流程。</p>
        </div>
        <a class="ghost-button" href="/" target="_blank" rel="noreferrer">
          <i data-lucide="external-link" aria-hidden="true"></i>
          独立打开
        </a>
      </div>
      <iframe
        class="chat-frame"
        src="/?embedded=1"
        title="${escapeHtml(lesson.title)}课堂对话"
      ></iframe>
    </section>
  `;
}

function renderMastery() {
  const firstLessonId = workspace.lessons[0]?.lesson_id || "";
  if (!ui.masteryCourseId || !getLesson(ui.masteryCourseId)) {
    ui.masteryCourseId = firstLessonId;
  }

  const lesson = getLesson(ui.masteryCourseId);
  const knowledgePoints = getLessonKnowledgePoints(ui.masteryCourseId);
  const states = knowledgePoints.map((knowledgePoint) =>
    getMasteryState(knowledgePoint.kp_id),
  );
  const unassessed = states.filter((state) => state.stars === 0).length;
  const annotated = states.filter((state) => state.stars > 0).length;
  const mastered = states.filter((state) => state.stars === 5).length;
  const average = states.length
    ? (states.reduce((total, state) => total + state.stars, 0) / states.length).toFixed(1)
    : "0.0";

  const currentTable = `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>知识点</th>
            <th>当前星级</th>
            <th>状态</th>
            <th>关联标注</th>
            <th>最近证据</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${knowledgePoints
            .map((knowledgePoint) => {
              const state = getMasteryState(knowledgePoint.kp_id);
              return `
                <tr>
                  <td>
                    <span class="knowledge-title">
                      <strong>${escapeHtml(knowledgePoint.title)}</strong>
                      <small>${escapeHtml(knowledgePoint.kp_id)}</small>
                    </span>
                  </td>
                  <td>${starsMarkup(state.stars)}</td>
                  <td>${statusPill(state.stars)}</td>
                  <td>${state.annotation_ids.length} 条</td>
                  <td>${escapeHtml(state.last_evidence || "暂无学习证据")}</td>
                  <td>
                    <button
                      class="ghost-button"
                      type="button"
                      data-annotate="${escapeHtml(knowledgePoint.kp_id)}"
                      data-lesson="${escapeHtml(lesson.lesson_id)}"
                    >
                      <i data-lucide="bookmark-plus" aria-hidden="true"></i>
                      标注
                    </button>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  const historyRows = workspace.mastery_history
    .filter((item) => {
      const knowledgePoint = getKnowledgePoint(item.kp_id);
      return knowledgePoint?.lesson_id === lesson.lesson_id;
    })
    .sort((left, right) =>
      String(right.occurred_at || "").localeCompare(String(left.occurred_at || "")),
    );

  const historyTable = `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>知识点</th>
            <th>星级变化</th>
            <th>状态变化</th>
            <th>来源</th>
            <th>证据</th>
          </tr>
        </thead>
        <tbody>
          ${
            historyRows.length
              ? historyRows
                  .map((item) => {
                    const knowledgePoint = getKnowledgePoint(item.kp_id);
                    return `
                      <tr>
                        <td>${formatDate(item.occurred_at)}</td>
                        <td>${escapeHtml(knowledgePoint?.title || item.kp_id)}</td>
                        <td>${item.old_stars} ★ → ${item.new_stars} ★</td>
                        <td>${escapeHtml(item.old_status)} → ${escapeHtml(
                          item.new_status,
                        )}</td>
                        <td>${escapeHtml(item.source)}</td>
                        <td>${escapeHtml(item.evidence || "暂无")}</td>
                      </tr>
                    `;
                  })
                  .join("")
              : '<tr><td colspan="6">还没有历史变化。</td></tr>'
          }
        </tbody>
      </table>
    </div>
  `;

  app.innerHTML = `
    ${pageHeader(
      "Mastery",
      "掌握情况",
      "知识点来自 KNOWLEDGE-BASE。未检测不画星星；产生标注后从 1 星开始；只有通过考核才能达到 5 星。",
    )}
    <div class="toolbar">
      <div class="toolbar-group">
        ${courseSelect({
          id: "masteryCourse",
          value: lesson.lesson_id,
          label: "课程",
        })}
      </div>
      <div class="tabs" role="tablist" aria-label="掌握情况视图">
        <button class="tab-button" type="button" role="tab" data-mastery-tab="current" aria-selected="${
          ui.masteryTab === "current"
        }">当前掌握</button>
        <button class="tab-button" type="button" role="tab" data-mastery-tab="history" aria-selected="${
          ui.masteryTab === "history"
        }">历史变化</button>
      </div>
    </div>
    <section class="summary-grid">
      <div class="summary-item"><span>知识点总数</span><strong>${states.length}</strong></div>
      <div class="summary-item"><span>未检测</span><strong>${unassessed}</strong></div>
      <div class="summary-item"><span>已有标注</span><strong>${annotated}</strong></div>
      <div class="summary-item"><span>平均星级</span><strong>${average}</strong></div>
    </section>
    ${
      ui.masteryTab === "history"
        ? `<section><div class="section-heading"><div><h2>历史掌握</h2><p>每次星级或状态变化只追加，不覆盖。已掌握 ${mastered} 个知识点。</p></div></div>${historyTable}</section>`
        : `<section><div class="section-heading"><div><h2>当前掌握</h2><p>标注与掌握结果放在同一知识点行里查看。</p></div></div>${currentTable}</section>`
    }
  `;
}

function renderReviews() {
  const firstLessonId = workspace.lessons[0]?.lesson_id || "";
  if (!ui.reviewCourseId || !getLesson(ui.reviewCourseId)) {
    ui.reviewCourseId = firstLessonId;
  }

  const knowledgePoints = getLessonKnowledgePoints(ui.reviewCourseId).filter(
    (knowledgePoint) => getMasteryState(knowledgePoint.kp_id).stars > 0,
  );

  if (
    !ui.reviewKnowledgePointId ||
    !knowledgePoints.some(
      (knowledgePoint) => knowledgePoint.kp_id === ui.reviewKnowledgePointId,
    )
  ) {
    ui.reviewKnowledgePointId = knowledgePoints[0]?.kp_id || "";
  }

  const selected = getKnowledgePoint(ui.reviewKnowledgePointId);
  const selectedState = selected ? getMasteryState(selected.kp_id) : null;
  const selectedAnnotations = selected
    ? getAnnotationsForKnowledgePoint(selected.kp_id)
    : [];

  app.innerHTML = `
    ${pageHeader(
      "Gap review",
      "查缺补漏",
      "先选择课程，再查看产生过标注的知识点。复习详细板块已经预留，本轮先打通数据入口。",
    )}
    <div class="toolbar">
      <div class="toolbar-group">
        ${courseSelect({
          id: "reviewCourse",
          value: ui.reviewCourseId,
          label: "课程",
        })}
      </div>
      <span class="meta-chip">${knowledgePoints.length} 个待复习知识点</span>
    </div>
    <div class="review-layout">
      <section class="review-list" aria-label="查缺补漏知识点列表">
        ${
          knowledgePoints.length
            ? knowledgePoints
                .map((knowledgePoint) => {
                  const state = getMasteryState(knowledgePoint.kp_id);
                  const annotations = getAnnotationsForKnowledgePoint(
                    knowledgePoint.kp_id,
                  );
                  return `
                    <button
                      class="review-list-item"
                      type="button"
                      data-review-kp="${escapeHtml(knowledgePoint.kp_id)}"
                      aria-pressed="${
                        knowledgePoint.kp_id === ui.reviewKnowledgePointId
                      }"
                    >
                      <span class="knowledge-title">
                        <strong>${escapeHtml(knowledgePoint.title)}</strong>
                        <small>${escapeHtml(knowledgePoint.kp_id)} · ${annotations.length} 条标注</small>
                      </span>
                      <span>${starsMarkup(state.stars)}</span>
                    </button>
                  `;
                })
                .join("")
            : '<div class="empty-state"><p>这门课程还没有已标注知识点。</p></div>'
        }
      </section>
      <section class="review-detail">
        ${
          selected && selectedState
            ? `
              <p class="eyebrow">Selected knowledge point</p>
              <h2>${escapeHtml(selected.title)}</h2>
              <p>${escapeHtml(selected.definition)}</p>
              <div class="course-meta">
                <span class="meta-chip">${escapeHtml(selected.kp_id)}</span>
                ${statusPill(selectedState.stars)}
                <span class="meta-chip">${selectedAnnotations.length} 条标注</span>
              </div>
              <p><strong>最近证据：</strong>${escapeHtml(
                selectedState.last_evidence || "暂无学习证据",
              )}</p>
              <div class="placeholder-panel">
                <i data-lucide="construction" aria-hidden="true"></i>
                <strong>复习详细板块预留</strong>
                <span>后续在这里接针对性讲解、练习和可验证的掌握检测。</span>
              </div>
            `
            : `
              <div class="empty-state">
                <p>请先选择一门有标注记录的课程。</p>
              </div>
            `
        }
      </section>
    </div>
  `;
}

function renderAnnotations() {
  const firstLessonId = workspace.lessons[0]?.lesson_id || "";
  if (ui.annotationCourseId && !getLesson(ui.annotationCourseId)) {
    ui.annotationCourseId = "";
  }

  const annotations = workspace.annotations.filter((annotation) => {
    const matchesCourse =
      !ui.annotationCourseId || annotation.lesson_id === ui.annotationCourseId;
    const matchesStatus =
      !ui.annotationStatus || annotation.status === ui.annotationStatus;
    return matchesCourse && matchesStatus;
  });

  app.innerHTML = `
    ${pageHeader(
      "Annotation log",
      "标注记录",
      "标注单独保存原始字段和来源位置。掌握情况只读取其中有知识点关联的部分。",
    )}
    <div class="toolbar">
      <div class="toolbar-group">
        <label for="annotationCourseFilter">课程</label>
        <select id="annotationCourseFilter">
          <option value="">全部课程</option>
          ${workspace.lessons
            .map(
              (lesson) => `
                <option value="${escapeHtml(lesson.lesson_id)}" ${
                  lesson.lesson_id === ui.annotationCourseId ? "selected" : ""
                }>${escapeHtml(lesson.course_name)} · ${escapeHtml(lesson.title)}</option>
              `,
            )
            .join("")}
        </select>
        <label for="annotationStatusFilter">状态</label>
        <select id="annotationStatusFilter">
          <option value="">全部状态</option>
          <option value="open" ${ui.annotationStatus === "open" ? "selected" : ""}>待处理</option>
          <option value="已解决" ${
            ui.annotationStatus === "已解决" ? "selected" : ""
          }>已解决</option>
          <option value="延后" ${ui.annotationStatus === "延后" ? "selected" : ""}>延后</option>
        </select>
      </div>
      <span class="meta-chip">共 ${annotations.length} 条记录</span>
    </div>
    <section class="annotation-list">
      ${
        annotations.length
          ? annotations
              .map((annotation) => {
                const lesson = getLesson(annotation.lesson_id);
                const state = getMasteryState(annotation.knowledge_point_id);
                return `
                  <article class="annotation-card">
                    <div>
                      <h3>${escapeHtml(annotation.knowledge_point_title)}</h3>
                      <p>${escapeHtml(annotation.student_note || annotation.content || "没有填写备注")}</p>
                      <div class="annotation-meta">
                        ${annotationStatusPill(annotation.status)}
                        ${statusPill(state.stars)}
                        <span class="tag">${escapeHtml(annotation.mark_level)}</span>
                        ${(annotation.reason_tags || [])
                          .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
                          .join("")}
                      </div>
                    </div>
                    <div class="annotation-side">
                      <span>${escapeHtml(lesson?.title || annotation.lesson_id)}</span>
                      <span>${escapeHtml(annotation.segment_id)}</span>
                      <span>${formatDate(annotation.created_at)}</span>
                      ${
                        annotation.source_link
                          ? `<a class="ghost-button" href="${escapeHtml(
                              annotation.source_link,
                            )}">查看来源</a>`
                          : ""
                      }
                    </div>
                  </article>
                `;
              })
              .join("")
          : '<div class="empty-state"><p>当前筛选条件下没有标注记录。</p></div>'
      }
    </section>
  `;
}

function renderEmpty(title, description) {
  app.innerHTML = `
    <div class="empty-state">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
    </div>
  `;
}

function updateNavigation(routeName) {
  const activeName =
    routeName === "course" ? "courses" : routeName === "courses" ? "courses" : routeName;
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === activeName) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function render() {
  if (!workspace) return;

  const route = parseRoute();
  updateNavigation(route.name);

  if (route.name === "course") {
    renderCourseDetail(route);
  } else if (route.name === "mastery") {
    renderMastery();
  } else if (route.name === "reviews") {
    renderReviews();
  } else if (route.name === "annotations") {
    renderAnnotations();
  } else {
    renderCourseList();
  }

  if (window.lucide?.createIcons) {
    window.lucide.createIcons({
      attrs: {
        "aria-hidden": "true",
      },
    });
  }
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}

function closeAnnotationDialog() {
  annotationError.hidden = true;
  annotationError.textContent = "";
  annotationDialog.close();
}

function openAnnotationDialog(knowledgePointId, lessonId, requestedSegmentId = "") {
  const knowledgePoint = getKnowledgePoint(knowledgePointId);
  const lesson = getLesson(lessonId);
  if (!knowledgePoint || !lesson) {
    showToast("没有找到对应的课程或知识点。");
    return;
  }

  const segment =
    workspace.segments.find(
      (item) =>
        item.segment_id === requestedSegmentId &&
        item.lesson_id === lessonId &&
        (item.knowledge_point_ids || []).includes(knowledgePointId),
    ) ||
    workspace.segments.find(
      (item) =>
        item.lesson_id === lessonId &&
        (item.knowledge_point_ids || []).includes(knowledgePointId),
    );

  if (!segment) {
    showToast("这个知识点还没有关联课程片段，暂时不能标注。");
    return;
  }

  annotationForm.dataset.lessonId = lessonId;
  annotationForm.dataset.segmentId = segment.segment_id;
  annotationForm.dataset.knowledgePointId = knowledgePointId;
  annotationTitle.textContent = "添加标注";
  annotationCourse.textContent = `${lesson.course_name} · ${lesson.title}`;
  annotationKnowledgePoint.textContent = `${knowledgePoint.kp_id} · ${knowledgePoint.title}`;
  annotationForm.reset();
  annotationForm.querySelector('input[name="markLevel"][value="没掌握"]').checked = true;
  annotationError.hidden = true;
  annotationDialog.showModal();
}

async function loadWorkspace() {
  try {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || `读取失败：HTTP ${response.status}`);
    }
    workspace = payload;
    studentName.textContent = workspace.student.display_name || "同学";
    render();
  } catch (error) {
    app.innerHTML = `
      <div class="error-state">
        <h1>学习空间暂时无法打开</h1>
        <p>${escapeHtml(error instanceof Error ? error.message : "未知错误")}</p>
        <button class="secondary-button" type="button" data-retry>重新读取</button>
      </div>
    `;
  }
}

app.addEventListener("click", (event) => {
  const annotateButton = event.target.closest("[data-annotate]");
  if (annotateButton) {
    openAnnotationDialog(
      annotateButton.dataset.annotate,
      annotateButton.dataset.lesson,
    );
    return;
  }

  const annotateLessonButton = event.target.closest("[data-annotate-lesson]");
  if (annotateLessonButton) {
    const knowledgePoint = getLessonKnowledgePoints(
      annotateLessonButton.dataset.annotateLesson,
    )[0];
    if (knowledgePoint) {
      openAnnotationDialog(
        knowledgePoint.kp_id,
        annotateLessonButton.dataset.annotateLesson,
      );
    }
    return;
  }

  const masteryTab = event.target.closest("[data-mastery-tab]");
  if (masteryTab) {
    ui.masteryTab = masteryTab.dataset.masteryTab;
    renderMastery();
    if (window.lucide?.createIcons) window.lucide.createIcons();
    return;
  }

  const reviewItem = event.target.closest("[data-review-kp]");
  if (reviewItem) {
    ui.reviewKnowledgePointId = reviewItem.dataset.reviewKp;
    renderReviews();
    if (window.lucide?.createIcons) window.lucide.createIcons();
    return;
  }

  if (event.target.closest("[data-retry]")) {
    loadWorkspace();
  }
});

app.addEventListener("change", (event) => {
  if (event.target.id === "masteryCourse") {
    ui.masteryCourseId = event.target.value;
    renderMastery();
    if (window.lucide?.createIcons) window.lucide.createIcons();
  }

  if (event.target.id === "reviewCourse") {
    ui.reviewCourseId = event.target.value;
    ui.reviewKnowledgePointId = "";
    renderReviews();
    if (window.lucide?.createIcons) window.lucide.createIcons();
  }

  if (event.target.id === "annotationCourseFilter") {
    ui.annotationCourseId = event.target.value;
    renderAnnotations();
    if (window.lucide?.createIcons) window.lucide.createIcons();
  }

  if (event.target.id === "annotationStatusFilter") {
    ui.annotationStatus = event.target.value;
    renderAnnotations();
    if (window.lucide?.createIcons) window.lucide.createIcons();
  }
});

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-dialog]")) {
    closeAnnotationDialog();
  }
});

annotationDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeAnnotationDialog();
});

annotationForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(annotationForm);
  const reasonTags = formData.getAll("reasonTags").map(String);
  const markLevel = String(formData.get("markLevel") || "");
  const studentNote = String(formData.get("studentNote") || "").trim();
  const submitButton = annotationForm.querySelector('button[type="submit"]');

  if (reasonTags.length === 0 && markLevel === "没掌握") {
    annotationError.textContent = "请至少选择一个原因标签。";
    annotationError.hidden = false;
    return;
  }

  submitButton.disabled = true;
  annotationError.hidden = true;

  try {
    const response = await fetch("/api/workspace/annotations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        lessonId: annotationForm.dataset.lessonId,
        segmentId: annotationForm.dataset.segmentId,
        knowledgePointId: annotationForm.dataset.knowledgePointId,
        markLevel,
        reasonTags,
        studentNote,
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || `保存失败：HTTP ${response.status}`);
    }

    workspace = payload.bootstrap;
    closeAnnotationDialog();
    showToast(`已保存标注 ${payload.annotation.point_id}，知识点保持 1 星起步。`);
    render();
  } catch (error) {
    annotationError.textContent =
      error instanceof Error ? error.message : "标注保存失败。";
    annotationError.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
});

window.addEventListener("hashchange", render);

loadWorkspace();
