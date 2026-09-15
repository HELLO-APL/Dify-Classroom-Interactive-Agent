import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_DIR = fileURLToPath(new URL("./", import.meta.url));
const ENV_FILE = resolve(SERVER_DIR, ".env");

function loadLocalEnv(filePath, override = false) {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (value && (override || !process.env[key])) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv(ENV_FILE);

const HOST = process.env.CLASSROOM_CHAT_HOST || "127.0.0.1";
const PORT = Number(process.env.CLASSROOM_CHAT_PORT || 4173);
const N8N_CHAT_WEBHOOK =
  process.env.N8N_CHAT_WEBHOOK ||
  "http://localhost:5678/webhook/24c2ba65-8779-45a1-86d8-8c6ab4f824eb/chat";
const N8N_BASE_URL = new URL(N8N_CHAT_WEBHOOK).origin;

const chatPublicDir = resolve(fileURLToPath(new URL("./public/", import.meta.url)));
const projectDir = resolve(SERVER_DIR, "..");
const workspaceDir = resolve(projectDir, "student-workspace");
const workspacePublicDir = resolve(workspaceDir, "public");
const workspaceDataDir = resolve(workspaceDir, "data");
const segmentDir = resolve(projectDir, "class-point", "segments");
const pointDir = resolve(projectDir, "class-point", "points");
const knowledgeBaseFile = resolve(projectDir, "class agent", "KNOWLEDGE-BASE.md");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const STAR_STATUS = {
  0: "未检测",
  1: "已标注",
  2: "初步理解",
  3: "理解中",
  4: "接近掌握",
  5: "已掌握",
};

const QWEN_VOICES = [
  "Cherry",
  "Serena",
  "Ethan",
  "Chelsie",
  "Momo",
  "Vivian",
  "Moon",
  "Maia",
  "Kai",
  "Bella",
  "Ryan",
  "Elias",
  "Arthur",
];

const ttsAudioCache = new Map();
const TTS_CACHE_LIMIT = 64;

function getTtsConfig() {
  loadLocalEnv(ENV_FILE, true);

  const provider = process.env.TTS_PROVIDER || "qwen";
  return {
    provider,
    qwen: {
      apiKey: process.env.TTS_QWEN_API_KEY || "",
      baseUrl:
        process.env.TTS_QWEN_BASE_URL || "https://dashscope.aliyuncs.com/api/v1",
      model: process.env.TTS_QWEN_MODEL || "qwen3-tts-flash",
      voice: process.env.TTS_QWEN_VOICE || "Cherry",
      speed: Number(process.env.TTS_QWEN_SPEED || 1),
    },
  };
}

function getTtsStatus() {
  const config = getTtsConfig();
  return {
    provider: config.provider,
    configured: config.provider === "qwen" && Boolean(config.qwen.apiKey),
    model: config.qwen.model,
    voice: config.qwen.voice,
    voices: QWEN_VOICES,
  };
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      throw new Error("请求内容超过 1 MB 限制。");
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("请求内容不是有效 JSON。");
  }
}

function normalizeN8nResponse(payload) {
  let value = payload;
  let embeddedSpeechKind = "";

  if (Array.isArray(value)) {
    value = value[0];
  }

  if (value?.json && typeof value.json === "object") {
    value = value.json;
  }

  if (value?.data && typeof value.data === "object") {
    value = value.data;
  }

  let output =
    value?.output ??
    value?.text ??
    value?.message ??
    value?.reply ??
    value?.data ??
    value;

  if (typeof output === "string") {
    const trimmed = output.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        embeddedSpeechKind = String(parsed.speechKind || "").trim();
        output =
          parsed.text ??
          parsed.reply ??
          parsed.output ??
          parsed.message ??
          output;
      } catch {
        // Keep the original text when it only resembles JSON.
      }
    }
  }

  if (output && typeof output === "object") {
    output = output.reply ?? output.output ?? output.text ?? output.message ?? JSON.stringify(output);
  }

  const text = String(output || "").trim();
  if (!text) {
    throw new Error("n8n 返回了空消息。");
  }

  let speech = null;
  if (value?.speech && typeof value.speech === "object") {
    speech = value.speech;
  } else if (value?.speechKind || embeddedSpeechKind) {
    const kind = String(value?.speechKind || embeddedSpeechKind).trim();
    speech = {
      enabled: kind === "teacher_guidance",
      kind,
      text,
    };
  }

  return {
    text,
    speech,
    raw: value,
  };
}

async function forwardChat(request, response) {
  const body = await readRequestBody(request);
  const chatInput = String(body.chatInput || "").trim();
  const sessionId = String(body.sessionId || "").trim();

  if (!chatInput) {
    return sendJson(response, 400, { ok: false, error: "消息不能为空。" });
  }

  if (!sessionId) {
    return sendJson(response, 400, { ok: false, error: "缺少会话 ID。" });
  }

  const upstream = await fetch(N8N_CHAT_WEBHOOK, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "sendMessage",
      sessionId,
      chatInput,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const responseText = await upstream.text();
  let payload;

  try {
    payload = JSON.parse(responseText);
  } catch {
    payload = { output: responseText };
  }

  if (!upstream.ok) {
    const detail =
      payload?.message ||
      payload?.error?.message ||
      payload?.error ||
      responseText ||
      upstream.statusText;
    return sendJson(response, upstream.status, {
      ok: false,
      error: `n8n 返回 HTTP ${upstream.status}：${String(detail).slice(0, 500)}`,
    });
  }

  const normalized = normalizeN8nResponse(payload);

  if (isHostCommand(chatInput) && !normalized.speech) {
    normalized.speech = {
      enabled: true,
      kind: "teacher_guidance",
      text: normalized.text,
    };
  }

  return sendJson(response, 200, {
    ok: true,
    message: normalized,
  });
}

function isHostCommand(text) {
  const commands = ["/上课开始", "/开始播放", "/段落结束", "/下课"];
  return commands.some((command) => text.startsWith(command));
}

function readCachedAudio(key) {
  const cached = ttsAudioCache.get(key);
  if (!cached) return null;
  ttsAudioCache.delete(key);
  ttsAudioCache.set(key, cached);
  return cached;
}

function cacheAudio(key, audio) {
  ttsAudioCache.set(key, audio);
  while (ttsAudioCache.size > TTS_CACHE_LIMIT) {
    ttsAudioCache.delete(ttsAudioCache.keys().next().value);
  }
}

async function generateQwenSpeech({ text, voice, speed }) {
  const config = getTtsConfig();
  if (!config.qwen.apiKey) {
    const error = new Error("高级语音未配置，请填写 TTS_QWEN_API_KEY。");
    error.code = "TTS_NOT_CONFIGURED";
    throw error;
  }

  const rate = Math.round((Number(speed || config.qwen.speed || 1) - 1) * 500);
  const response = await fetch(
    `${config.qwen.baseUrl}/services/aigc/multimodal-generation/generation`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.qwen.apiKey}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        model: config.qwen.model,
        input: {
          text,
          voice,
          language_type: "Auto",
        },
        parameters: {
          rate,
        },
      }),
      signal: AbortSignal.timeout(60_000),
    },
  );

  const responseText = await response.text();
  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail =
      payload?.message ||
      payload?.error?.message ||
      payload?.error ||
      responseText ||
      response.statusText;
    throw new Error(`Qwen TTS 返回 HTTP ${response.status}：${String(detail).slice(0, 500)}`);
  }

  const audioUrl = payload?.output?.audio?.url;
  if (!audioUrl) {
    throw new Error(`Qwen TTS 未返回音频地址：${responseText.slice(0, 500)}`);
  }

  const audioResponse = await fetch(audioUrl, {
    signal: AbortSignal.timeout(60_000),
  });

  if (!audioResponse.ok) {
    throw new Error(`下载 Qwen 音频失败：HTTP ${audioResponse.status}`);
  }

  return {
    buffer: Buffer.from(await audioResponse.arrayBuffer()),
    contentType: audioResponse.headers.get("content-type") || "audio/wav",
  };
}

async function synthesizeSpeech(request, response) {
  const body = await readRequestBody(request);
  const text = String(body.text || "").trim();
  const status = getTtsStatus();

  if (!text) {
    return sendJson(response, 400, { ok: false, error: "语音文本不能为空。" });
  }

  if (text.length > 600) {
    return sendJson(response, 400, {
      ok: false,
      error: "单段语音不能超过 600 个字符，请先在前端切分。",
    });
  }

  if (!status.configured) {
    return sendJson(response, 503, {
      ok: false,
      code: "TTS_NOT_CONFIGURED",
      error: "高级语音未配置，请在 classroom-chat/.env 中填写 TTS_QWEN_API_KEY。",
      tts: status,
    });
  }

  const voice = QWEN_VOICES.includes(String(body.voice))
    ? String(body.voice)
    : status.voice;
  const speed = Math.min(2, Math.max(0.5, Number(body.speed || 1)));
  const cacheKey = `${status.model}:${voice}:${speed}:${text}`;
  const cached = readCachedAudio(cacheKey);

  if (cached) {
    response.writeHead(200, {
      "Content-Type": cached.contentType,
      "Cache-Control": "private, max-age=86400",
      "X-TTS-Cache": "hit",
    });
    response.end(cached.buffer);
    return;
  }

  const audio = await generateQwenSpeech({ text, voice, speed });
  cacheAudio(cacheKey, audio);

  response.writeHead(200, {
    "Content-Type": audio.contentType,
    "Cache-Control": "private, max-age=86400",
    "X-TTS-Cache": "miss",
  });
  response.end(audio.buffer);
}

async function checkHealth(response) {
  try {
    const health = await fetch(`${N8N_BASE_URL}/healthz`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3_000),
    });

    if (!health.ok) {
      throw new Error(`HTTP ${health.status}`);
    }

    return sendJson(response, 200, {
      ok: true,
      connected: true,
      webhookDisplay: N8N_CHAT_WEBHOOK,
      tts: getTtsStatus(),
    });
  } catch (error) {
    return sendJson(response, 503, {
      ok: false,
      connected: false,
      webhookDisplay: N8N_CHAT_WEBHOOK,
      tts: getTtsStatus(),
      error: error instanceof Error ? error.message : "n8n 未响应",
    });
  }
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function readJsonDirectory(directory) {
  try {
    const files = await readdir(directory);
    const records = [];

    for (const fileName of files) {
      if (!fileName.toLowerCase().endsWith(".json")) continue;
      const record = await readJsonFile(resolve(directory, fileName), null);
      if (record) records.push(record);
    }

    return records;
  } catch {
    return [];
  }
}

function parseKnowledgeBase(markdown) {
  const blocks = String(markdown || "").split(/^## /m).slice(1);
  const knowledgePoints = [];

  for (const block of blocks) {
    const [heading = "", ...lines] = block.split(/\r?\n/);
    const headingMatch = heading.trim().match(/^(KP-\d+)\s+(.+)$/);
    if (!headingMatch) continue;

    const item = {
      kp_id: headingMatch[1],
      title: headingMatch[2].trim(),
      definition: "",
      detection_question: "",
      mastery_criteria: "",
      order_index: knowledgePoints.length + 1,
    };

    for (const line of lines) {
      const fieldMatch = line.match(/^-\s*(定义|检测问题|掌握表现):\s*(.+)$/);
      if (!fieldMatch) continue;

      if (fieldMatch[1] === "定义") item.definition = fieldMatch[2].trim();
      if (fieldMatch[1] === "检测问题") item.detection_question = fieldMatch[2].trim();
      if (fieldMatch[1] === "掌握表现") item.mastery_criteria = fieldMatch[2].trim();
    }

    knowledgePoints.push(item);
  }

  return knowledgePoints;
}

function legacyStatusToStars(status) {
  if (status === "掌握") return 4;
  if (status === "部分掌握") return 3;
  if (status === "未掌握") return 1;
  return 0;
}

function normalizeMasteryState(rawState, knowledgePoints) {
  const source =
    rawState && typeof rawState === "object" && rawState.knowledge_points
      ? rawState.knowledge_points
      : rawState || {};

  const states = {};
  for (const knowledgePoint of knowledgePoints) {
    const raw = source[knowledgePoint.kp_id];
    if (typeof raw === "string") {
      const stars = legacyStatusToStars(raw);
      states[knowledgePoint.kp_id] = {
        kp_id: knowledgePoint.kp_id,
        stars,
        status: STAR_STATUS[stars],
        assessment_status: stars === 5 ? "已通过" : "未考核",
        annotation_ids: [],
        last_annotation_id: null,
        last_source: "manual",
        last_evidence: `从旧状态“${raw}”迁移。`,
        updated_at: null,
      };
      continue;
    }

    const stars = Math.max(0, Math.min(5, Number(raw?.stars) || 0));
    states[knowledgePoint.kp_id] = {
      kp_id: knowledgePoint.kp_id,
      stars,
      status: raw?.status || STAR_STATUS[stars],
      assessment_status: raw?.assessment_status || (stars === 5 ? "已通过" : "未考核"),
      annotation_ids: Array.isArray(raw?.annotation_ids) ? raw.annotation_ids : [],
      last_annotation_id: raw?.last_annotation_id || null,
      last_source: raw?.last_source || "knowledge_base",
      last_evidence: raw?.last_evidence || "",
      updated_at: raw?.updated_at || null,
    };
  }

  return {
    version: 2,
    student_id: rawState?.student_id || "student-001",
    updated_at: rawState?.updated_at || null,
    knowledge_points: states,
  };
}

async function loadWorkspaceBootstrap() {
  const knowledgeBaseMarkdown = await readFile(knowledgeBaseFile, "utf8");
  const knowledgePoints = parseKnowledgeBase(knowledgeBaseMarkdown);
  const knowledgePointMap = new Map(
    knowledgePoints.map((knowledgePoint) => [knowledgePoint.kp_id, knowledgePoint]),
  );
  const segments = (await readJsonDirectory(segmentDir)).sort(
    (left, right) => Number(left.order || 0) - Number(right.order || 0),
  );
  const rawPoints = await readJsonDirectory(pointDir);
  const rawMasteryState = await readJsonFile(
    resolve(workspaceDataDir, "mastery-state.json"),
    {},
  );
  const masteryHistory = await readJsonFile(
    resolve(workspaceDataDir, "mastery-history.json"),
    [],
  );
  const lessonMap = new Map();
  const knowledgePointLesson = new Map();

  for (const segment of segments) {
    const lessonId = String(segment.lesson_id || "unknown-lesson");
    const lesson = lessonMap.get(lessonId) || {
      lesson_id: lessonId,
      course_name: segment.source?.course || "未命名课程",
      title: segment.source?.chapter || segment.title || lessonId,
      summary: "",
      segment_ids: [],
      knowledge_point_ids: [],
    };

    lesson.segment_ids.push(segment.segment_id);
    for (const kpId of segment.knowledge_point_ids || []) {
      if (!lesson.knowledge_point_ids.includes(kpId)) {
        lesson.knowledge_point_ids.push(kpId);
      }
      knowledgePointLesson.set(kpId, lessonId);
    }
    lessonMap.set(lessonId, lesson);
  }

  for (const lesson of lessonMap.values()) {
    lesson.summary = `${lesson.segment_ids.length} 个课程片段，${lesson.knowledge_point_ids.length} 个知识点。`;
    lesson.segment_ids.sort();
    lesson.knowledge_point_ids.sort();
  }

  const segmentMap = new Map(segments.map((segment) => [segment.segment_id, segment]));
  const annotations = rawPoints
    .map((point) => {
      const segment = segmentMap.get(point.segment_id);
      return {
        ...point,
        knowledge_point_id:
          point.knowledge_point_id ||
          segment?.knowledge_point_ids?.[0] ||
          null,
        knowledge_point_title:
          knowledgePointMap.get(
            point.knowledge_point_id || segment?.knowledge_point_ids?.[0],
          )?.title || "未关联知识点",
      };
    })
    .sort((left, right) =>
      String(right.created_at || "").localeCompare(String(left.created_at || "")),
    );

  const masteryState = normalizeMasteryState(rawMasteryState, knowledgePoints);

  return {
    student: {
      student_id: "student-001",
      display_name: "同学",
    },
    lessons: [...lessonMap.values()].sort((left, right) =>
      left.lesson_id.localeCompare(right.lesson_id),
    ),
    knowledge_points: knowledgePoints.map((knowledgePoint) => ({
      ...knowledgePoint,
      lesson_id: knowledgePointLesson.get(knowledgePoint.kp_id) || null,
    })),
    segments,
    annotations,
    mastery_state: masteryState,
    mastery_history: Array.isArray(masteryHistory) ? masteryHistory : [],
  };
}

async function createWorkspaceAnnotation(request, response) {
  const body = await readRequestBody(request);
  const lessonId = String(body.lessonId || "").trim();
  const segmentId = String(body.segmentId || "").trim();
  const knowledgePointId = String(body.knowledgePointId || "").trim();
  const markLevel = String(body.markLevel || "").trim();
  const reasonTags = Array.isArray(body.reasonTags)
    ? body.reasonTags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 4)
    : [];
  const studentNote = String(body.studentNote || "").trim().slice(0, 500);

  if (!lessonId || !segmentId || !knowledgePointId) {
    return sendJson(response, 400, {
      ok: false,
      error: "课程、片段和知识点不能为空。",
    });
  }

  if (!["掌握", "没掌握"].includes(markLevel)) {
    return sendJson(response, 400, {
      ok: false,
      error: "标注必须选择掌握或没掌握。",
    });
  }

  const bootstrap = await loadWorkspaceBootstrap();
  const segment = bootstrap.segments.find((item) => item.segment_id === segmentId);
  const knowledgePoint = bootstrap.knowledge_points.find(
    (item) => item.kp_id === knowledgePointId,
  );

  if (!segment || segment.lesson_id !== lessonId) {
    return sendJson(response, 400, { ok: false, error: "片段不属于当前课程。" });
  }

  if (!knowledgePoint || !(segment.knowledge_point_ids || []).includes(knowledgePointId)) {
    return sendJson(response, 400, { ok: false, error: "知识点不属于当前课程片段。" });
  }

  const existingPoints = await readJsonDirectory(pointDir);
  const nextNumber =
    existingPoints.reduce((maximum, point) => {
      const match = String(point.point_id || "").match(/^point-(\d+)$/);
      return Math.max(maximum, Number(match?.[1] || 0));
    }, 0) + 1;
  const pointId = `point-${String(nextNumber).padStart(3, "0")}`;
  const now = new Date().toISOString();
  const host = request.headers.host || `${HOST}:${PORT}`;
  const annotation = {
    point_id: pointId,
    student_id: "student-001",
    lesson_id: lessonId,
    segment_id: segmentId,
    knowledge_point_id: knowledgePointId,
    type: "marker",
    mark_level: markLevel,
    reason_tags: reasonTags,
    student_note: studentNote,
    source_link: `http://${host}/student/#course/${lessonId}?point=${pointId}`,
    status: "open",
    created_at: now,
    updated_at: now,
  };

  await writeFile(
    resolve(pointDir, `${pointId}.json`),
    `${JSON.stringify(annotation, null, 2)}\n`,
    "utf8",
  );

  const stateFile = resolve(workspaceDataDir, "mastery-state.json");
  const historyFile = resolve(workspaceDataDir, "mastery-history.json");
  const masteryState = normalizeMasteryState(
    await readJsonFile(stateFile, {}),
    bootstrap.knowledge_points,
  );
  const current = masteryState.knowledge_points[knowledgePointId];
  const oldStars = current.stars;
  const oldStatus = current.status;
  const newStars = Math.max(oldStars, 1);
  const newStatus = STAR_STATUS[newStars];

  current.annotation_ids = [...new Set([...current.annotation_ids, pointId])];
  current.last_annotation_id = pointId;
  current.stars = newStars;
  current.status = newStatus;
  current.last_source = "class_point";
  current.last_evidence = `新增标记点 ${pointId}，标注：${markLevel}${
    reasonTags.length > 0 ? ` / ${reasonTags.join(" / ")}` : ""
  }。`;
  current.updated_at = now;
  masteryState.updated_at = now;

  const history = await readJsonFile(historyFile, []);
  const nextHistoryNumber =
    (Array.isArray(history) ? history : []).reduce((maximum, item) => {
      const match = String(item.history_id || "").match(/^mh-(\d+)$/);
      return Math.max(maximum, Number(match?.[1] || 0));
    }, 0) + 1;

  if (oldStars !== newStars || oldStatus !== newStatus) {
    history.push({
      history_id: `mh-${String(nextHistoryNumber).padStart(3, "0")}`,
      student_id: "student-001",
      kp_id: knowledgePointId,
      old_stars: oldStars,
      new_stars: newStars,
      old_status: oldStatus,
      new_status: newStatus,
      source: "class_point",
      evidence: `新增标记点 ${pointId}。`,
      annotation_id: pointId,
      occurred_at: now,
    });
  }

  await writeFile(stateFile, `${JSON.stringify(masteryState, null, 2)}\n`, "utf8");
  await writeFile(historyFile, `${JSON.stringify(history, null, 2)}\n`, "utf8");

  return sendJson(response, 201, {
    ok: true,
    annotation,
    mastery: current,
    bootstrap: await loadWorkspaceBootstrap(),
  });
}

async function serveDirectory(request, response, publicDir, requestPath) {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host}`);
  const requestedPath =
    requestPath === "/" || requestPath === "" ? "/index.html" : requestPath;
  const safePath = requestedPath.replace(/^[/\\]+/, "");
  const absolutePath = resolve(publicDir, safePath);

  if (
    absolutePath !== publicDir &&
    !absolutePath.startsWith(`${publicDir}${sep}`)
  ) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) throw new Error("Not a file");

    const content = await readFile(absolutePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(absolutePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

async function serveStatic(request, response) {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host}`);
  const pathname = requestUrl.pathname;

  if (pathname === "/student") {
    response.writeHead(302, { Location: "/student/" });
    response.end();
    return;
  }

  if (pathname.startsWith("/student/")) {
    await serveDirectory(
      request,
      response,
      workspacePublicDir,
      pathname.slice("/student".length),
    );
    return;
  }

  await serveDirectory(request, response, chatPublicDir, pathname);
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/api/health") {
      await checkHealth(response);
      return;
    }

    if (request.method === "GET" && request.url === "/api/workspace") {
      return sendJson(response, 200, {
        ok: true,
        ...(await loadWorkspaceBootstrap()),
      });
    }

    if (request.method === "POST" && request.url === "/api/chat") {
      await forwardChat(request, response);
      return;
    }

    if (
      request.method === "POST" &&
      request.url === "/api/workspace/annotations"
    ) {
      await createWorkspaceAnnotation(request, response);
      return;
    }

    if (request.method === "POST" && request.url === "/api/tts") {
      await synthesizeSpeech(request, response);
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      await serveStatic(request, response);
      return;
    }

    response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
  } catch (error) {
    console.error("[classroom-chat]", error);
    if (!response.headersSent) {
      const status = error?.code === "TTS_NOT_CONFIGURED" ? 503 : 500;
      sendJson(response, status, {
        ok: false,
        code: error?.code,
        error: error instanceof Error ? error.message : "服务器内部错误。",
        tts: getTtsStatus(),
      });
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`课堂对话页面：http://${HOST}:${PORT}`);
  console.log(`学生 workspace：http://${HOST}:${PORT}/student/`);
  console.log(`n8n Webhook：${N8N_CHAT_WEBHOOK}`);
  console.log(`高级语音：${getTtsStatus().configured ? "已配置" : "未配置"}`);
});
