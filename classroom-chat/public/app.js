const isEmbedded = new URLSearchParams(location.search).get("embedded") === "1";
document.body.classList.toggle("embedded", isEmbedded);

const STORAGE_KEYS = {
  sessionId: "teach.classroom.sessionId",
  messages: "teach.classroom.messages",
  voiceMode: "teach.classroom.voiceMode",
  voiceEnabled: "teach.classroom.voiceEnabled",
  ttsVoice: "teach.classroom.ttsVoice",
};

const HOST_COMMANDS = ["/上课开始", "/开始播放", "/段落结束", "/下课"];
const TTS_VOICE_LABELS = {
  Cherry: "芊悦 Cherry",
  Serena: "苏瑶 Serena",
  Ethan: "晨煦 Ethan",
  Chelsie: "千雪 Chelsie",
  Momo: "茉兔 Momo",
  Vivian: "十三 Vivian",
  Moon: "月白 Moon",
  Maia: "四月 Maia",
  Kai: "凯 Kai",
  Bella: "萌宝 Bella",
  Ryan: "甜茶 Ryan",
  Elias: "墨讲师 Elias",
  Arthur: "徐大爷 Arthur",
};

const elements = {
  connectionStatus: document.querySelector("#connectionStatus"),
  connectionText: document.querySelector("#connectionText"),
  messageList: document.querySelector("#messageList"),
  messageInput: document.querySelector("#messageInput"),
  composer: document.querySelector("#composer"),
  sendButton: document.querySelector("#sendButton"),
  voiceToggle: document.querySelector("#voiceToggle"),
  stopVoiceButton: document.querySelector("#stopVoiceButton"),
  settingsToggle: document.querySelector("#settingsToggle"),
  settingsPanel: document.querySelector("#settingsPanel"),
  settingsClose: document.querySelector("#settingsClose"),
  voiceMode: document.querySelector("#voiceMode"),
  ttsVoice: document.querySelector("#ttsVoice"),
  ttsHint: document.querySelector("#ttsHint"),
  webhookDisplay: document.querySelector("#webhookDisplay"),
  sessionDisplay: document.querySelector("#sessionDisplay"),
  newSessionButton: document.querySelector("#newSessionButton"),
  notice: document.querySelector("#notice"),
};

let messages = readJson(STORAGE_KEYS.messages, []);
let sessionId = localStorage.getItem(STORAGE_KEYS.sessionId) || createSessionId();
let voiceMode = localStorage.getItem(STORAGE_KEYS.voiceMode) || "teacher";
let voiceEnabled = localStorage.getItem(STORAGE_KEYS.voiceEnabled) === "true";
let ttsVoice = localStorage.getItem(STORAGE_KEYS.ttsVoice) || "Cherry";
let advancedTts = {
  configured: false,
  provider: "qwen",
  model: "qwen3-tts-flash",
  voice: "Cherry",
  voices: ["Cherry"],
};
let isSending = false;
let speechQueue = [];
let activeUtterance = null;
let activeAudio = null;
let activeAudioUrl = "";
let activeSpeechId = null;
let activeSpeechController = null;
let speechSession = 0;
const speechBlobCache = new Map();

localStorage.setItem(STORAGE_KEYS.sessionId, sessionId);

function createSessionId() {
  if (globalThis.crypto?.randomUUID) {
    return `teach-${crypto.randomUUID()}`;
  }
  return `teach-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function persistMessages() {
  localStorage.setItem(STORAGE_KEYS.messages, JSON.stringify(messages.slice(-80)));
}

function showNotice(text, kind = "info") {
  elements.notice.textContent = text;
  elements.notice.dataset.kind = kind;
  elements.notice.hidden = false;
}

function hideNotice() {
  elements.notice.hidden = true;
}

function setConnectionState(state, text) {
  elements.connectionStatus.dataset.state = state;
  elements.connectionText.textContent = text;
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function speakerIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");

  const body = document.createElementNS("http://www.w3.org/2000/svg", "path");
  body.setAttribute("d", "M11 5 6 9H3v6h3l5 4V5Z");
  const wave = document.createElementNS("http://www.w3.org/2000/svg", "path");
  wave.setAttribute("d", "M15.5 8.5a5 5 0 0 1 0 7");
  svg.append(body, wave);
  return svg;
}

function renderEmptyState() {
  const empty = document.createElement("div");
  empty.className = "empty-state";

  const symbol = document.createElement("div");
  symbol.className = "empty-symbol";
  symbol.textContent = "teach";

  const title = document.createElement("h2");
  title.textContent = "课堂已经准备好";

  const copy = document.createElement("p");
  copy.textContent = "输入一条消息开始互动。老师引导会自动进入语音播报队列。";

  empty.append(symbol, title, copy);
  elements.messageList.append(empty);
}

function createMessageElement(message) {
  const article = document.createElement("article");
  article.className = `message ${message.role}`;
  article.dataset.messageId = message.id;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = message.role === "assistant" ? "师" : "我";
  avatar.setAttribute("aria-hidden", "true");

  const body = document.createElement("div");
  body.className = "message-body";

  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = `${message.role === "assistant" ? "老师" : "我"} · ${formatTime(message.createdAt)}`;

  const content = document.createElement("p");
  content.className = "message-content";
  content.textContent = message.text;

  body.append(meta, content);

  if (message.role === "assistant") {
    const actions = document.createElement("div");
    actions.className = "message-actions";

    const playButton = document.createElement("button");
    playButton.className = "message-action";
    playButton.type = "button";
    playButton.dataset.speaking = "false";
    playButton.setAttribute("aria-label", "朗读这条回复");
    playButton.append(speakerIcon(), document.createTextNode("朗读"));
    playButton.addEventListener("click", () => speakMessage(message, true));
    actions.append(playButton);
    body.append(actions);
  }

  article.append(avatar, body);
  return article;
}

function renderMessages() {
  elements.messageList.replaceChildren();

  if (messages.length === 0) {
    renderEmptyState();
    return;
  }

  for (const message of messages) {
    elements.messageList.append(createMessageElement(message));
  }

  scrollToLatest();
}

function appendMessage(message) {
  messages.push(message);
  persistMessages();

  if (messages.length === 1) {
    elements.messageList.replaceChildren();
  }

  elements.messageList.append(createMessageElement(message));
  scrollToLatest();
}

function appendTypingIndicator() {
  const wrapper = document.createElement("article");
  wrapper.className = "message assistant";
  wrapper.id = "typingIndicator";

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = "师";

  const body = document.createElement("div");
  body.className = "message-body";

  const typing = document.createElement("div");
  typing.className = "typing";
  typing.setAttribute("aria-label", "老师正在回复");
  typing.append(document.createElement("span"), document.createElement("span"), document.createElement("span"));

  body.append(typing);
  wrapper.append(avatar, body);
  elements.messageList.append(wrapper);
  scrollToLatest();
}

function removeTypingIndicator() {
  document.querySelector("#typingIndicator")?.remove();
}

function scrollToLatest() {
  requestAnimationFrame(() => {
    elements.messageList.scrollTop = elements.messageList.scrollHeight;
  });
}

function isHostCommand(text) {
  const normalized = text.trim();
  return HOST_COMMANDS.some((command) => normalized.startsWith(command));
}

function shouldAutoSpeak(message, sourceText) {
  if (!voiceEnabled || voiceMode === "off") {
    return false;
  }

  if (message.speech?.enabled === false) {
    return false;
  }

  if (message.speech?.kind === "teacher_guidance") {
    return true;
  }

  if (voiceMode === "all") {
    return true;
  }

  return isHostCommand(sourceText);
}

function cleanSpeechText(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[`*_>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getPreferredVoice() {
  const voices = speechSynthesis.getVoices();
  const preferredNames = [
    "Microsoft Xiaoxiao",
    "Microsoft Yunxi",
    "Microsoft Huihui",
    "Ting-Ting",
    "Google 普通话",
    "Chinese",
  ];

  for (const name of preferredNames) {
    const match = voices.find((voice) => voice.name.includes(name));
    if (match) return match;
  }

  return (
    voices.find((voice) => voice.lang.toLowerCase() === "zh-cn") ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith("zh")) ||
    null
  );
}

function updateVoiceButton() {
  elements.voiceToggle.setAttribute("aria-pressed", String(voiceEnabled));
  elements.voiceToggle.setAttribute("aria-label", voiceEnabled ? "关闭语音" : "开启语音");
  elements.voiceToggle.title = voiceEnabled ? "关闭语音" : "开启语音";
}

function splitSpeechText(text, maxLength = 110) {
  const normalized = cleanSpeechText(text);
  if (!normalized) return [];
  if (normalized.length <= maxLength) return [normalized];

  const units = normalized
    .split(/(?<=[。！？!?；;：:\n])/u)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";

  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  const append = (unit) => {
    if (!current) {
      current = unit;
      return;
    }

    if ((current + unit).length <= maxLength) {
      current += unit;
      return;
    }

    pushCurrent();
    current = unit;
  };

  for (const originalUnit of units.length > 0 ? units : [normalized]) {
    if (originalUnit.length <= maxLength) {
      append(originalUnit);
      continue;
    }

    const clauses = originalUnit.split(/(?<=[，,、])/u).filter(Boolean);
    const pieces = clauses.length > 1 ? clauses : [originalUnit];

    for (const piece of pieces) {
      if (piece.length <= maxLength) {
        append(piece);
        continue;
      }

      for (let start = 0; start < piece.length; start += maxLength) {
        append(piece.slice(start, start + maxLength));
      }
    }
  }

  pushCurrent();
  return chunks;
}

function applyTtsConfig(config) {
  if (!config || typeof config !== "object") return;

  advancedTts = {
    ...advancedTts,
    ...config,
    voices: Array.isArray(config.voices) && config.voices.length > 0
      ? config.voices
      : advancedTts.voices,
  };

  const voices = advancedTts.voices;
  if (!voices.includes(ttsVoice)) {
    ttsVoice = voices.includes(config.voice) ? config.voice : voices[0];
    localStorage.setItem(STORAGE_KEYS.ttsVoice, ttsVoice);
  }

  elements.ttsVoice.replaceChildren();
  for (const voice of voices) {
    const option = document.createElement("option");
    option.value = voice;
    option.textContent = TTS_VOICE_LABELS[voice] || voice;
    elements.ttsVoice.append(option);
  }

  elements.ttsVoice.value = ttsVoice;
  elements.ttsVoice.disabled = !advancedTts.configured || voices.length === 0;
  elements.ttsHint.textContent = advancedTts.configured
    ? `已连接 ${advancedTts.provider === "qwen" ? "Qwen 高级语音" : advancedTts.provider}，模型 ${advancedTts.model}`
    : "高级语音未配置。请在 classroom-chat/.env 中填写 TTS_QWEN_API_KEY，当前使用浏览器语音。";
}

async function getSpeechBlob(text) {
  const cacheKey = `${ttsVoice}:${text}`;
  if (speechBlobCache.has(cacheKey)) {
    return speechBlobCache.get(cacheKey);
  }

  const controller = new AbortController();
  activeSpeechController = controller;

  const response = await fetch("/api/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      voice: ttsVoice,
      speed: 1,
    }),
    signal: controller.signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const error = new Error(payload?.error || `高级语音请求失败：HTTP ${response.status}`);
    error.code = payload?.code;
    throw error;
  }

  const blob = await response.blob();
  speechBlobCache.set(cacheKey, blob);

  while (speechBlobCache.size > 24) {
    speechBlobCache.delete(speechBlobCache.keys().next().value);
  }

  return blob;
}

function speakMessage(message, manual = false) {
  const text = cleanSpeechText(message.speech?.text || message.text);
  if (!text) return;

  if (!voiceEnabled && manual) {
    voiceEnabled = true;
    localStorage.setItem(STORAGE_KEYS.voiceEnabled, "true");
    updateVoiceButton();
  }

  if (!voiceEnabled) return;

  if (manual) {
    speechQueue = [];
    stopSpeech(false);
  }

  for (const chunk of splitSpeechText(text)) {
    speechQueue.push({ id: message.id, text: chunk });
  }

  playNextSpeech();
}

function finishSpeechItem(messageId) {
  setMessageSpeaking(messageId, false);
  activeUtterance = null;
  activeAudio = null;
  activeAudioUrl = "";
  activeSpeechId = null;
  activeSpeechController = null;

  if (speechQueue.length === 0) {
    elements.stopVoiceButton.hidden = true;
  }

  playNextSpeech();
}

function speakWithBrowser(item, session) {
  if (!("speechSynthesis" in window)) {
    showNotice("高级语音不可用，当前浏览器也不支持系统语音。", "error");
    finishSpeechItem(item.id);
    return;
  }

  const utterance = new SpeechSynthesisUtterance(item.text);
  const preferredVoice = getPreferredVoice();

  utterance.__messageId = item.id;
  if (preferredVoice) utterance.voice = preferredVoice;
  utterance.lang = preferredVoice?.lang || "zh-CN";
  utterance.rate = 0.96;
  utterance.pitch = 1.02;
  utterance.volume = 1;

  activeUtterance = utterance;
  activeSpeechId = item.id;
  setMessageSpeaking(item.id, true);
  elements.stopVoiceButton.hidden = false;

  utterance.onend = () => {
    if (session !== speechSession) return;
    finishSpeechItem(item.id);
  };

  utterance.onerror = () => {
    if (session !== speechSession) return;
    finishSpeechItem(item.id);
  };

  speechSynthesis.speak(utterance);
}

async function playNextSpeech() {
  if (
    !voiceEnabled ||
    activeUtterance ||
    activeAudio ||
    speechQueue.length === 0
  ) {
    return;
  }

  const item = speechQueue.shift();
  const session = speechSession;
  activeSpeechId = item.id;
  setMessageSpeaking(item.id, true);
  elements.stopVoiceButton.hidden = false;

  if (!advancedTts.configured) {
    speakWithBrowser(item, session);
    return;
  }

  try {
    const blob = await getSpeechBlob(item.text);
    if (session !== speechSession) return;

    if (speechQueue.length > 0 && advancedTts.configured) {
      void getSpeechBlob(speechQueue[0].text).catch(() => {});
    }

    activeAudioUrl = URL.createObjectURL(blob);
    activeAudio = new Audio(activeAudioUrl);
    activeAudio.preload = "auto";

    activeAudio.addEventListener("ended", () => {
      if (session !== speechSession) return;
      URL.revokeObjectURL(activeAudioUrl);
      finishSpeechItem(item.id);
    });

    activeAudio.addEventListener("error", () => {
      if (session !== speechSession) return;
      URL.revokeObjectURL(activeAudioUrl);
      finishSpeechItem(item.id);
    });

    await activeAudio.play();
  } catch (error) {
    if (error?.name === "AbortError" || session !== speechSession) return;

    if (error?.code === "TTS_NOT_CONFIGURED") {
      advancedTts.configured = false;
      applyTtsConfig(advancedTts);
    }

    showNotice(
      error instanceof Error
        ? `${error.message} 已切换为浏览器语音。`
        : "高级语音失败，已切换为浏览器语音。",
      "error",
    );
    speakWithBrowser(item, session);
  }
}

function stopSpeech(clearQueue = true) {
  speechSession += 1;
  activeSpeechController?.abort();
  activeSpeechController = null;

  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio = null;
  }

  if (activeAudioUrl) {
    URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = "";
  }

  if ("speechSynthesis" in window) {
    speechSynthesis.cancel();
  }

  if (activeSpeechId) setMessageSpeaking(activeSpeechId, false);
  activeUtterance = null;
  activeSpeechId = null;
  if (clearQueue) speechQueue = [];
  elements.stopVoiceButton.hidden = true;
  document.querySelectorAll('.message-action[data-speaking="true"]').forEach((button) => {
    button.dataset.speaking = "false";
  });
}

function setMessageSpeaking(messageId, speaking) {
  const article = document.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
  const button = article?.querySelector(".message-action");
  if (button) button.dataset.speaking = String(speaking);
}

function resizeComposer() {
  elements.messageInput.style.height = "auto";
  elements.messageInput.style.height = `${Math.min(elements.messageInput.scrollHeight, 160)}px`;
}

function setSending(value) {
  isSending = value;
  elements.sendButton.disabled = value;
  elements.messageInput.disabled = value;
}

async function sendMessage(text) {
  const chatInput = text.trim();
  if (!chatInput || isSending) return;

  hideNotice();
  appendMessage({
    id: crypto.randomUUID(),
    role: "student",
    text: chatInput,
    createdAt: Date.now(),
  });

  elements.messageInput.value = "";
  resizeComposer();
  setSending(true);
  appendTypingIndicator();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chatInput,
        sessionId,
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || `请求失败：HTTP ${response.status}`);
    }

    removeTypingIndicator();

    const assistantMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      text: data.message.text,
      speech: data.message.speech || null,
      createdAt: Date.now(),
    };

    appendMessage(assistantMessage);
    setConnectionState("online", "n8n 已连接");

    if (shouldAutoSpeak(assistantMessage, chatInput)) {
      speakMessage(assistantMessage);
    }
  } catch (error) {
    removeTypingIndicator();
    setConnectionState("offline", "n8n 未连接");
    showNotice(error instanceof Error ? error.message : "消息发送失败。", "error");
  } finally {
    setSending(false);
    elements.messageInput.focus();
  }
}

async function checkConnection() {
  setConnectionState("checking", "正在连接 n8n");

  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const data = await response.json();

    if (!response.ok || !data.connected) {
      throw new Error(data.error || "n8n 未响应");
    }

    setConnectionState("online", "n8n 已连接");
    elements.webhookDisplay.textContent = data.webhookDisplay || "已配置";
    applyTtsConfig(data.tts);
    hideNotice();
  } catch (error) {
    setConnectionState("offline", "n8n 未连接");
    elements.webhookDisplay.textContent = "后端代理未连通";
    showNotice(
      error instanceof Error
        ? `${error.message}。请先启动 n8n，再刷新此页面。`
        : "请先启动 n8n，再刷新此页面。",
      "error",
    );
  }
}

function openSettings(open) {
  elements.settingsPanel.setAttribute("aria-hidden", String(!open));
  elements.settingsToggle.setAttribute("aria-expanded", String(open));
}

function createNewSession() {
  sessionId = createSessionId();
  localStorage.setItem(STORAGE_KEYS.sessionId, sessionId);
  messages = [];
  persistMessages();
  stopSpeech();
  elements.sessionDisplay.textContent = sessionId;
  renderMessages();
  hideNotice();
  openSettings(false);
  elements.messageInput.focus();
}

elements.composer.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(elements.messageInput.value);
});

elements.messageInput.addEventListener("input", resizeComposer);
elements.messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    elements.composer.requestSubmit();
  }
});

elements.voiceToggle.addEventListener("click", () => {
  voiceEnabled = !voiceEnabled;
  localStorage.setItem(STORAGE_KEYS.voiceEnabled, String(voiceEnabled));
  updateVoiceButton();

  if (!voiceEnabled) {
    stopSpeech();
  }
});

elements.stopVoiceButton.addEventListener("click", () => stopSpeech());
elements.settingsToggle.addEventListener("click", () => {
  openSettings(elements.settingsPanel.getAttribute("aria-hidden") === "true");
});
elements.settingsClose.addEventListener("click", () => openSettings(false));
elements.newSessionButton.addEventListener("click", createNewSession);

elements.ttsVoice.value = ttsVoice;
elements.ttsVoice.addEventListener("change", () => {
  ttsVoice = elements.ttsVoice.value;
  localStorage.setItem(STORAGE_KEYS.ttsVoice, ttsVoice);
  speechBlobCache.clear();
});

elements.voiceMode.value = voiceMode;
elements.voiceMode.addEventListener("change", () => {
  voiceMode = elements.voiceMode.value;
  localStorage.setItem(STORAGE_KEYS.voiceMode, voiceMode);
  if (voiceMode === "off") stopSpeech();
});

elements.sessionDisplay.textContent = sessionId;
updateVoiceButton();
renderMessages();
resizeComposer();
checkConnection();

if ("speechSynthesis" in window) {
  speechSynthesis.addEventListener("voiceschanged", () => {
    getPreferredVoice();
  });
}

setInterval(checkConnection, 30000);
