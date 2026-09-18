"""主动引导智能体 —— 真实 LangGraph 编排器实现。

依据 `orchestrator/ORCHESTRATOR.md` 规范实现，覆盖全部 11 个节点：
load_plan / tick / load_context / classify_turn / host_event / teach /
judge_mastery / judge_advance / advance_stage / write_state / format_reply

关键约定（与规范一致）：
- `now` 由会话层注入 state，图内任何节点不调 datetime.now() → 可单测、可回放。
- 判断写进 state（target_phase），路由函数只读不判。
- `stage_snapshots` 用 Annotated[list, operator.add] 累加，不覆盖。
- 空壳降级：stages/*/questions.md 为空 → TMISSION 检验问题 → KNOWLEDGE-BASE 检测问题。

LLM 接入（可选）：
    设置环境变量 AGENT_LLM_BASE_URL / AGENT_LLM_API_KEY / AGENT_LLM_MODEL
    （任意 OpenAI 兼容 /chat/completions 端点）后，teach 节点改用真实大模型。
    未配置时 teach 走规范第 8 节的确定性降级行为，整张图照样能跑完整节课。
    星级判定（judge_mastery）始终是确定性的关键词匹配，不依赖模型。

运行演示：python orchestrator/run_demo.py
"""

from __future__ import annotations

import json
import operator
import os
import re
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Annotated, Literal, TypedDict

from langgraph.graph import END, START, StateGraph

ROOT = Path(__file__).resolve().parent.parent

STAGE_NAMES = {
    "guided_learning": "讲解阶段",
    "recap_discussion": "复述阶段",
    "deep_inquiry": "深层探究阶段",
    "class_discussion": "全班讨论阶段",
}
STAR_STATUS = {1: "已接触", 2: "初步理解", 3: "理解中", 4: "接近掌握"}


# ═══════════════════════════════════════════════════════════════
# LLM 可插拔层（OpenAI 兼容端点；未配置返回 None → 走确定性脚本）
# ═══════════════════════════════════════════════════════════════

def llm_available() -> bool:
    return bool(
        os.environ.get("AGENT_LLM_BASE_URL")
        and os.environ.get("AGENT_LLM_API_KEY")
        and os.environ.get("AGENT_LLM_MODEL")
    )


def llm_chat(system: str, user: str) -> str | None:
    base = os.environ.get("AGENT_LLM_BASE_URL")
    key = os.environ.get("AGENT_LLM_API_KEY")
    model = os.environ.get("AGENT_LLM_MODEL")
    if not (base and key and model):
        return None
    try:
        payload = json.dumps(
            {"model": model, "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ]},
        ).encode("utf-8")
        req = urllib.request.Request(
            base.rstrip("/") + "/chat/completions",
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {key}",
            },
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.load(resp)
        return data["choices"][0]["message"]["content"]
    except Exception:
        return None


# ═══════════════════════════════════════════════════════════════
# 证据匹配 —— 星级判定的确定性核心（judge_mastery 与 teach 共用）
# 每个 KP 分若干"证据组"，学生话语命中全部组 = 完整证据，命中部分 = 零散要点。
# 关键词取自 runtime/TMISSION.md 的 答对证据。
# ═══════════════════════════════════════════════════════════════

EVIDENCE_GROUPS: dict[str, list[list[str]]] = {
    "KP-001": [["CPU", "一个进程", "只能"], ["调度", "规则", "谁先"]],
    "KP-002": [
        ["高级调度", "作业调度", "调入内存", "作业调入"],
        ["低级调度", "进程调度", "就绪", "上 CPU", "上CPU"],
        ["中级调度", "对换", "内存平衡"],
    ],
    "KP-003": [
        ["周转", "提交", "完成"],
        ["等待时间", "就绪队列"],
        ["响应时间", "首次", "第一次"],
    ],
    "KP-004": [
        ["饥饿", "长作业", "等很久"],
        ["HRRN", "响应比", "动态优先级", "等待时间加"],
    ],
    "KP-005": [
        ["打断", "中断", "抢占"],
        ["时间片", "优先级", "更短", "耗尽"],
    ],
    "KP-006": [
        ["时间片", "轮转", "RR"],
        ["多级反馈队列", "队列间", "移动"],
    ],
}


def match_evidence(kp_id: str, text: str) -> tuple[int, int]:
    """返回 (命中的证据组数, 总组数)。"""
    groups = EVIDENCE_GROUPS.get(kp_id, [])
    if not groups:
        return (0, 0)
    hits = sum(1 for g in groups if any(kw in text for kw in g))
    return (hits, len(groups))


# ═══════════════════════════════════════════════════════════════
# 三级问题兜底链：
#   stages/<phase>/questions.md → runtime/TMISSION.md 检验问题 → KNOWLEDGE-BASE 检测问题
# ═══════════════════════════════════════════════════════════════

def _read(path: str) -> str:
    try:
        return (ROOT / path).read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""


def _strip_code_fences(text: str) -> str:
    return re.sub(r"```.*?```", "", text, flags=re.S)


def _parse_stage_questions(phase: str) -> list[dict]:
    """第 1 级：stages/<phase>/questions.md 里老师填的问题（剥掉代码块示例）。"""
    text = _read(f"stages/{phase}/questions.md")
    if not text:
        return []
    body = _strip_code_fences(text)
    out: list[dict] = []
    for block in re.split(r"^## 问题", body, flags=re.M)[1:]:
        m_kp = re.search(r"关联[:：]\s*(KP-\d+|seg-\d+)", block)
        m_q = re.search(r"问题[:：]\s*(.+)", block)
        if m_kp and m_q:
            out.append({
                "kp_id": m_kp.group(1),
                "question": m_q.group(1).strip(),
                "source": "stages/questions.md",
            })
    return out


def _parse_tmission_questions() -> list[dict]:
    """第 2 级：runtime/TMISSION.md 核心难点的 检验问题。"""
    text = _read("runtime/TMISSION.md")
    if not text:
        return []
    out, cur = [], None
    for line in text.splitlines():
        m = re.match(r"-\s+(KP-\d+)\s", line)
        if m:
            cur = m.group(1)
            continue
        m2 = re.match(r"\s*-\s*检验问题[:：]\s*(.+)", line)
        if m2 and cur:
            out.append({
                "kp_id": cur,
                "question": m2.group(1).strip(),
                "source": "runtime/TMISSION.md 检验问题",
            })
            cur = None
    return out


def _parse_kb_questions() -> list[dict]:
    """第 3 级：rules/KNOWLEDGE-BASE.md 各 KP 的 检测问题。"""
    text = _read("rules/KNOWLEDGE-BASE.md")
    if not text:
        return []
    out, cur = [], None
    for line in text.splitlines():
        m = re.match(r"##\s+(KP-\d+)\s", line)
        if m:
            cur = m.group(1)
            continue
        m2 = re.match(r"-\s*检测问题[:：]\s*(.+)", line)
        if m2 and cur:
            out.append({
                "kp_id": cur,
                "question": m2.group(1).strip(),
                "source": "rules/KNOWLEDGE-BASE.md 检测问题",
            })
    return out


def build_question_queue(phase: str, unresolved: list[str]) -> list[dict]:
    """按三级兜底链为复述/探究阶段组装问题队列。"""
    if phase == "recap_discussion":
        q = _parse_stage_questions("recap_discussion")
        if q:
            return q
        q = _parse_tmission_questions()
        if q:
            return q
        return _parse_kb_questions()

    if phase == "deep_inquiry":
        q = _parse_stage_questions("deep_inquiry")
        if q:
            return q
        # 探究字段（为什么/如何/用在哪）为空 → 降级为通用探究问题。
        # 未关闭的难点优先问，其余按已获星级排序。
        text = _read("rules/KNOWLEDGE-BASE.md")
        filled = re.search(r"为什么这样设计[:：]\s*\S", text or "")
        if filled:
            out = []
            for m in re.finditer(
                r"##\s+(KP-\d+)[^\n]*\n((?:-[^\n]*\n)+)", text
            ):
                kp, body = m.group(1), m.group(2)
                for field, lead in (
                    ("为什么这样设计", "为什么"),
                    ("如何实现", "如何"),
                    ("解决什么实际问题", "用在哪"),
                ):
                    fm = re.search(rf"-\s*{field}[:：]\s*(\S.*)", body)
                    if fm:
                        out.append({
                            "kp_id": kp,
                            "question": fm.group(1).strip(),
                            "source": "rules/KNOWLEDGE-BASE.md 探究字段",
                        })
            if out:
                return out
        # 全空 → 规范第 8 节兜底："这个知识点能解决什么实际问题"
        kps = list(dict.fromkeys(
            unresolved
            + [k for k in EVIDENCE_GROUPS if k not in unresolved]
        ))
        return [{
            "kp_id": kp,
            "question": (
                f"这个知识点（{kp}）能解决什么实际问题？"
                "结合一个具体场景，说说为什么需要它、它是怎么起作用的。"
            ),
            "source": "内置默认探究问题（探究字段为空的降级）",
        } for kp in kps[:4]]

    return []


# ═══════════════════════════════════════════════════════════════
# State —— 规范第 2 节 + 实现所需的运行字段
# ═══════════════════════════════════════════════════════════════

class ClassroomState(TypedDict):
    # ── 会话标识 ──
    session_id: str
    student_id: str
    lesson_id: str

    # ── 编排器核心 ──
    host_phase: Literal[
        "uninitialized", "intro", "guided_learning",
        "recap_discussion", "deep_inquiry", "class_discussion", "ending",
    ]
    active_segment_id: str | None
    stage_started_at: str
    stage_elapsed_minutes: float
    lesson_elapsed_minutes: float
    stage_budget_minutes: float
    remaining_stages: list[str]
    advance_when: str
    now: str
    lesson_started_at: str | None

    # ── 推进策略（lesson-plan.json 的 advance_policy）──
    on_budget_exhausted: str
    on_evidence_reached: str
    min_stage_minutes: float
    max_stage_overrun_minutes: float

    # ── 教学状态 ──
    current_target: str | None
    current_question: str | None
    pending_question: dict | None     # 当前等待学生回答的问题 {kp_id, question, source}
    question_queue: list[dict]        # 本阶段的问题队列（三级兜底链产出）
    q_index: int
    attempts: int
    mastered: list[str]
    unresolved: list[str]

    # ── 学生 ──
    student_message: str
    speaker: Literal["host", "student"]
    student_status: Literal["active", "practicing", "waiting", "ended"]

    # ── 证据与掌握 ──
    turn_evidence: list[str]
    mastery_updates: list[dict]
    kp_stars: dict[str, int]          # 运行中的星级（落盘到 mastery-state.json）
    kp_meta: dict[str, dict]          # 各 KP 的 last_source/stage/evidence
    stage_snapshots: Annotated[list[dict], operator.add]

    # ── 输出 ──
    reply_text: str
    speech_kind: Literal["none", "auto"]
    advance_reason: str | None
    target_phase: str | None
    assembled_prompt: str
    lesson_plan: dict


# ═══════════════════════════════════════════════════════════════
# 节点实现
# ═══════════════════════════════════════════════════════════════

def load_plan(state: ClassroomState) -> dict:
    """载入并校验课程计划（规范第 9 节校验清单）。仅首轮生效，之后幂等。"""
    if state.get("host_phase") != "uninitialized":
        return {}

    plan = json.loads((ROOT / "lesson-data/lesson-plan.json").read_text(encoding="utf-8"))

    # 启动校验（任一失败 → 拒绝开课）
    problems = _validate_plan(plan)
    if problems:
        return {
            "host_phase": "ending",
            "reply_text": "开课校验失败：\n- " + "\n- ".join(problems),
            "advance_reason": "开课校验失败",
        }

    enabled = [s for s in plan["stages"] if s.get("enabled")]
    policy = plan["advance_policy"]

    # 星级基线：读当前 mastery-state（空模板 → 全 0 星）
    kp_stars: dict[str, int] = {}
    try:
        ms = json.loads((ROOT / "runtime/data/mastery-state.json").read_text(encoding="utf-8"))
        for kp, rec in (ms.get("knowledge_points") or {}).items():
            kp_stars[kp] = int(rec.get("stars", 0))
    except Exception:
        pass

    return {
        "lesson_plan": plan,
        "host_phase": "intro",
        "remaining_stages": [s["id"] for s in enabled],
        "stage_budget_minutes": 0.0,
        "advance_when": "budget",
        "lesson_started_at": state["now"],
        "stage_started_at": state["now"],
        "on_budget_exhausted": policy["on_budget_exhausted"],
        "on_evidence_reached": policy["on_evidence_reached"],
        "min_stage_minutes": float(policy["min_stage_minutes"]),
        "max_stage_overrun_minutes": float(policy["max_stage_overrun_minutes"]),
        "kp_stars": kp_stars,
        "kp_meta": {},
        "mastered": [],
        "unresolved": [],
        "question_queue": [],
        "q_index": 0,
        "attempts": 0,
    }


def _validate_plan(plan: dict) -> list[str]:
    problems: list[str] = []
    if plan.get("total_minutes", 0) <= 0:
        problems.append("total_minutes 必须大于 0")
    enabled = [s for s in plan.get("stages", []) if s.get("enabled")]
    if sum(s.get("minutes", 0) for s in enabled) > plan.get("total_minutes", 0):
        problems.append("启用阶段的时长之和超过 total_minutes")
    for s in enabled:
        if s.get("advance_when") not in ("either", "evidence", "budget"):
            problems.append(f"阶段 {s['id']} 的 advance_when 非法")
        if s["id"] in ("recap_discussion", "deep_inquiry", "class_discussion"):
            if not (ROOT / "stages" / s["id"]).is_dir():
                problems.append(f"启用阶段 {s['id']} 缺 stages/ 目录")
    for seg in plan.get("segments", []):
        if not (ROOT / "lesson-data/segments" / f"{seg['id']}.json").is_file():
            problems.append(f"缺段落文件 {seg['id']}.json")
    return problems


def tick(state: ClassroomState) -> dict:
    """唯一读时间的地方（规范第 5 节）。同时是每轮的复位点：清掉上一轮的
    证据 / 星级更新 / 判决，防止旧值渗入本轮判定。"""
    now = datetime.fromisoformat(state["now"])

    def minutes_since(t: str | None) -> float:
        if not t:
            return 0.0
        return round((now - datetime.fromisoformat(t)).total_seconds() / 60, 2)

    return {
        "stage_elapsed_minutes": minutes_since(state.get("stage_started_at")),
        "lesson_elapsed_minutes": minutes_since(state.get("lesson_started_at")),
        "turn_evidence": [],
        "mastery_updates": [],
        "target_phase": None,
        "advance_reason": None,
    }


def load_context(state: ClassroomState) -> dict:
    """分层装配上下文（规范第 4 节）。空壳阶段注入占位提示，不报错；
    进入复述/探究阶段时按三级兜底链组装问题队列。"""
    phase = state.get("host_phase")
    parts: list[str] = []

    # 规则层
    parts.append("[知识库]\n" + _read("rules/KNOWLEDGE-BASE.md"))
    # 计划层（仅当前阶段配置）
    plan = state.get("lesson_plan") or {}
    for s in plan.get("stages", []):
        if s["id"] == phase:
            parts.append(f"[阶段计划] {s}")
    # 课堂层：当前 segment + 绑定的 KP 全文
    if state.get("active_segment_id"):
        seg_text = _read(f"lesson-data/segments/{state['active_segment_id']}.json")
        parts.append("[当前段落]\n" + seg_text)
    # 阶段层（只有复述/探究/讨论三幕有；空壳 → 占位提示）
    if phase in ("recap_discussion", "deep_inquiry", "class_discussion"):
        for f in ("questions.md", "prompt.md", "rubric.md"):
            text = _read(f"stages/{phase}/{f}")
            parts.append(f"[{f}]\n" + (text.strip() or "[本阶段内容未配置]"))
    # 档案层
    parts.append("[掌握档案]\n" + json.dumps(state.get("kp_stars", {}), ensure_ascii=False))

    updates: dict = {"assembled_prompt": "\n\n".join(parts)}

    # 进入提问阶段 → 组装问题队列 + 未关闭目标
    if phase in ("recap_discussion", "deep_inquiry") and not state.get("question_queue"):
        queue = build_question_queue(phase, state.get("unresolved") or [])
        updates["question_queue"] = queue
        updates["q_index"] = 0
        updates["unresolved"] = [q["kp_id"] for q in queue]
    elif phase == "guided_learning" and not state.get("unresolved"):
        # 讲解阶段的"未关闭目标" = 全部段落涉及的 KP（讲过 ≠ 关闭）
        kps: list[str] = []
        for seg in (state.get("lesson_plan") or {}).get("segments", []):
            try:
                seg_data = json.loads(
                    (ROOT / "lesson-data/segments" / f"{seg['id']}.json")
                    .read_text(encoding="utf-8")
                )
                kps.extend(seg_data.get("knowledge_point_ids", []))
            except FileNotFoundError:
                pass
        updates["unresolved"] = list(dict.fromkeys(kps))

    return updates


def classify_turn(state: ClassroomState) -> dict:
    """判断本轮是谁在说话：host → 主持事件；student → 教学轮。"""
    is_host = state.get("speaker") == "host" or not state.get("student_message")
    return {"speaker": "host" if is_host else "student"}


def host_event(state: ClassroomState) -> dict:
    """处理主持事件：开场（intro）与课程中的主持人插话。"""
    phase = state.get("host_phase")
    plan = state.get("lesson_plan") or {}
    if phase == "intro":
        enabled = [s for s in plan.get("stages", []) if s.get("enabled")]
        agenda = "，".join(
            f"{STAGE_NAMES.get(s['id'], s['id'])}{s['minutes']}分钟" for s in enabled
        )
        reply = (
            f"上课！今天我们讲「{plan.get('lesson_title', state['lesson_id'])}」，"
            f"共 {plan.get('total_minutes')} 分钟。\n"
            f"流程：{agenda}。\n"
            "我会根据你的掌握情况调整节奏——听懂了我们就往前走，没听透我会多问几句。"
        )
        return {"reply_text": reply, "student_status": "active"}
    if phase == "ending":
        return {"reply_text": "这节课就到这里，下课！"}
    return {"reply_text": "（老师插话）好，我们继续。"}


def _segment_for_elapsed(plan: dict, elapsed: float) -> dict | None:
    """按累计段落时长决定当前讲哪个 segment。"""
    cum = 0.0
    for seg in plan.get("segments", []):
        cum += seg.get("minutes", 0)
        if elapsed < cum:
            sid = seg["id"]
            try:
                return json.loads(
                    (ROOT / "lesson-data/segments" / f"{sid}.json").read_text(encoding="utf-8")
                )
            except FileNotFoundError:
                return None
    return None


def teach(state: ClassroomState) -> dict:
    """本幕教学（规范第 3 节 teach 节点）。

    配置了 AGENT_LLM_* 环境变量时调真实大模型；
    否则走确定性脚本（各阶段有明确的降级行为，规范第 8 节）。
    """
    phase = state.get("host_phase")
    msg = state.get("student_message", "")
    elapsed = state.get("stage_elapsed_minutes", 0.0)
    budget = state.get("stage_budget_minutes", 0.0)
    plan = state.get("lesson_plan") or {}

    updates: dict = {"attempts": state.get("attempts", 0)}

    # 预算耗尽且策略为 wrap_up → 本轮先收尾再切幕
    wrap = (
        elapsed >= budget
        and budget > 0
        and state.get("on_budget_exhausted") == "wrap_up"
        and phase in STAGE_NAMES
    )
    wrap_line = "好，这一段的时间到了，我们收个尾。\n" if wrap else ""

    if llm_available():
        reply = llm_chat(
            "你是一名课堂智能体，负责在规定时间内把一门课上完。"
            "根据当前阶段与学生发言，生成简短、有引导性的中文回复。",
            f"当前阶段: {phase}（已 {elapsed}/{budget} 分钟）\n"
            f"上下文:\n{state.get('assembled_prompt', '')}\n\n学生说: {msg}",
        )
        if reply is not None:
            return {
                **updates,
                "reply_text": (wrap_line + reply).strip(),
                "current_question": None,
            }

    # ── 确定性降级脚本 ──
    if phase == "guided_learning":
        seg = _segment_for_elapsed(plan, elapsed)
        if seg and seg["segment_id"] != state.get("active_segment_id"):
            updates["active_segment_id"] = seg["segment_id"]
            kps = "、".join(seg.get("knowledge_point_ids", []))
            reply = (
                f"{wrap_line}[第{seg['order']}段] {seg['title']}\n"
                f"{seg['content']}\n"
                f"（涉及知识点：{kps}）"
            )
        else:
            reply = wrap_line + "很好，我们接着往下讲。"
        return {**updates, "reply_text": reply, "current_target": None,
                "current_question": None}

    if phase in ("recap_discussion", "deep_inquiry"):
        queue = state.get("question_queue") or []
        pending = state.get("pending_question")
        idx = state.get("q_index", 0)
        lines: list[str] = [wrap_line] if wrap_line else []

        if pending:
            # 学生回答了上一轮挂起的问题 → 反馈
            kp = pending["kp_id"]
            hits, total = match_evidence(kp, msg)
            updates["current_target"] = kp
            if total and hits == total:
                lines.append("很好，说得很完整！")
            elif hits > 0:
                lines.append(f"方向对了，但还差一点：{_hint(kp)}")
            else:
                updates["attempts"] = state.get("attempts", 0) + 1
                lines.append(f"再想想：{_hint(kp)}")
                lines.append(f"还是这个问题——{pending['question']}")
            if wrap:
                # 预算耗尽收尾：不再抛下一问，留给下一幕/下节课
                updates["pending_question"] = None
                lines.append("时间到了，这个问题我们先收在这里。")
            else:
                nxt = queue[idx + 1] if idx + 1 < len(queue) else None
                updates["q_index"] = idx + 1
                updates["pending_question"] = nxt
                updates["attempts"] = 0
                if nxt:
                    lead = "下一问：" if hits and total and hits == total else "这个我们先放一放，继续："
                    lines.append(f"{lead}{nxt['question']}")
                else:
                    lines.append("这一阶段的问题就到这里。")
            updates["current_question"] = (updates.get("pending_question") or pending).get("question")
        elif queue and idx < len(queue):
            q = queue[idx]
            updates["pending_question"] = q
            updates["current_target"] = None
            updates["current_question"] = q["question"]
            lead = (
                "这一阶段我想听听你的复述。"
                if phase == "recap_discussion" else "下面我们往深处挖一挖。"
            )
            lines.append(f"{lead}\n{q['question']}")
        elif queue:
            lines.append("这一阶段的问题就到这里。")
        else:
            lines.append("[本阶段内容未配置，且无可用问题]")

        return {**updates, "reply_text": "\n".join(x for x in lines if x)}

    if phase == "class_discussion":
        return {**updates, "reply_text": wrap_line + "进入全班讨论，请老师主导。",
                "current_target": None, "current_question": None}

    if phase == "ending":
        stars = state.get("kp_stars", {})
        lines = ["这节课到这里。最后看一眼你的掌握情况："]
        for kp, st in sorted(stars.items()):
            lines.append(f"- {kp}：{'★' * st}（{STAR_STATUS.get(st, '未检测')}）")
        lines.append("下节课见！")
        return {**updates, "reply_text": "\n".join(lines), "student_status": "ended"}

    return {**updates, "reply_text": wrap_line + "……"}


def _hint(kp_id: str) -> str:
    hints = {
        "KP-002": "想一想：作业是谁调进内存的？变成进程之后，又是谁决定它上 CPU？",
        "KP-003": "三个指标各有一个起点和一个终点，注意区分“第一次拿到 CPU”和“做完”。",
        "KP-004": "如果一直有短作业进来，长作业会怎样？HRRN 的响应比是怎么算的？",
        "KP-005": "关键是“正在运行的进程会不会被打断”，想想什么事件会触发打断。",
        "KP-006": "RR 拿什么换响应速度？多级反馈队列为什么不用预先知道进程长度？",
    }
    return hints.get(kp_id, "再从定义出发想一想。")


def judge_mastery(state: ClassroomState) -> dict:
    """按 MASTERY-STAR-RULES.md 判星级（确定性）。

    - guided_learning：讲过即记 1 星（已接触）
    - recap_discussion：零散要点 2 星 / 完整复述 3 星
    - deep_inquiry：说出机制 4 星
    - 星级只升不降；证据来自学生话语的关键词组匹配。
    """
    phase = state.get("host_phase")
    msg = state.get("student_message", "")
    kp_stars = dict(state.get("kp_stars") or {})
    kp_meta = dict(state.get("kp_meta") or {})
    updates: list[dict] = []
    evidence: list[str] = []
    mastered = list(state.get("mastered") or [])
    unresolved = list(state.get("unresolved") or [])
    now = state.get("now")

    def bump(kp: str, new_stars: int, source: str, ev: str) -> None:
        old = kp_stars.get(kp, 0)
        if new_stars > old:
            kp_stars[kp] = new_stars
            updates.append({
                "kp_id": kp, "old_stars": old, "new_stars": new_stars,
                "old_status": STAR_STATUS.get(old, "未检测"),
                "new_status": STAR_STATUS[new_stars],
                "source": source, "stage": phase, "evidence": ev,
                "occurred_at": now,
            })
            kp_meta[kp] = {
                "last_source": source, "last_stage": phase,
                "last_evidence": ev, "updated_at": now,
            }

    if phase == "guided_learning":
        seg_id = state.get("active_segment_id")
        if seg_id:
            try:
                seg = json.loads(
                    (ROOT / "lesson-data/segments" / f"{seg_id}.json").read_text(encoding="utf-8")
                )
            except FileNotFoundError:
                seg = None
            if seg:
                for kp in seg.get("knowledge_point_ids", []):
                    bump(kp, 1, "dialogue", f"讲解阶段讲过（{seg['title']}）")

    elif phase in ("recap_discussion", "deep_inquiry"):
        kp = state.get("current_target")
        if kp:
            hits, total = match_evidence(kp, msg)
            if total:
                if phase == "recap_discussion":
                    new_stars = 3 if hits == total else (2 if hits > 0 else 0)
                else:
                    new_stars = 4 if hits == total else 0
                if new_stars:
                    ev = f"学生原话：「{msg[:60]}」"
                    bump(kp, new_stars, "dialogue", ev)
                    evidence.append(f"{kp}: 命中 {hits}/{total} 组证据")
                    if hits == total:
                        if kp in unresolved:
                            unresolved.remove(kp)
                        if kp not in mastered:
                            mastered.append(kp)

    return {
        "mastery_updates": updates,
        "turn_evidence": evidence,
        "kp_stars": kp_stars,
        "kp_meta": kp_meta,
        "mastered": mastered,
        "unresolved": unresolved,
    }


def _next_phase(state: ClassroomState) -> str:
    rest = state.get("remaining_stages") or []
    return rest[0] if rest else "ending"


def judge_advance(state: ClassroomState) -> dict:
    """★ 编排核心（规范第 6 节）。判定顺序即优先级：证据优先于时间。"""
    phase = state.get("host_phase")

    if phase == "ending":
        return {"target_phase": None, "advance_reason": "课程已结束"}
    if phase == "intro":
        return {"target_phase": _next_phase(state), "advance_reason": "开场完成"}

    elapsed = state.get("stage_elapsed_minutes", 0.0)
    budget = state.get("stage_budget_minutes", 0.0)

    if elapsed < state.get("min_stage_minutes", 2.0):
        return {"target_phase": None, "advance_reason": "未达最短幕时长"}

    if state.get("advance_when") == "evidence" and state.get("unresolved"):
        return {"target_phase": None, "advance_reason": "尚有未关闭目标（evidence 模式）"}

    if state.get("turn_evidence") and not state.get("unresolved"):
        if (
            state.get("on_evidence_reached") == "advance"
            and state.get("advance_when") in ("evidence", "either")
        ):
            return {"target_phase": _next_phase(state), "advance_reason": "证据充分"}

    if elapsed >= budget:
        mode = state.get("on_budget_exhausted", "wrap_up")
        if mode == "force_advance":
            return {"target_phase": _next_phase(state), "advance_reason": "预算耗尽（force_advance）"}
        if mode == "wrap_up":
            return {"target_phase": _next_phase(state), "advance_reason": "预算耗尽（wrap_up 收尾后切幕）"}
        # extend：超时但仍在延长额度内 → 留幕
        overrun = elapsed - budget
        if overrun < state.get("max_stage_overrun_minutes", 3.0):
            return {"target_phase": None, "advance_reason": "预算超时但在延长额度内"}
        return {"target_phase": _next_phase(state), "advance_reason": "预算耗尽（extend 超限）"}

    return {"target_phase": None, "advance_reason": "时间与证据均未触发切幕"}


def advance_stage(state: ClassroomState) -> dict:
    """切幕三连（规范第 6 节）：写快照 → 取下一幕 → 重置本幕状态。"""
    phase = state.get("host_phase")
    now = state.get("now")
    plan = state.get("lesson_plan") or {}
    reply = state.get("reply_text", "")

    # 1) 阶段快照（intro/ending 不拍）
    snapshot = None
    if phase in STAGE_NAMES:
        snapshot = {
            "type": "stage_snapshot",
            "snapshot_id": f"ss-{len(state.get('stage_snapshots') or []) + 1:03d}",
            "student_id": state.get("student_id"),
            "lesson_id": state.get("lesson_id"),
            "stage": phase,
            "stage_elapsed_minutes": state.get("stage_elapsed_minutes"),
            "targets_closed": list(state.get("mastered") or []),
            "targets_open": list(state.get("unresolved") or []),
            "stars_snapshot": dict(state.get("kp_stars") or {}),
            "evidence": "；".join(state.get("turn_evidence") or []) or "本幕无文字证据",
            "occurred_at": now,
        }

    # 2) 取下一幕
    rest = list(state.get("remaining_stages") or [])
    if not rest:
        # 总结要算上本幕（deep_inquiry）刚拍的这条快照
        summary = _ending_summary(state, pending_snapshot=snapshot)
        out = {
            "host_phase": "ending",
            "remaining_stages": [],
            "stage_started_at": now,
            "stage_elapsed_minutes": 0.0,
            "stage_budget_minutes": 0.0,
            "current_target": None,
            "current_question": None,
            "pending_question": None,
            "question_queue": [],
            "q_index": 0,
            "mastered": [],
            "unresolved": [],
            "reply_text": (reply + "\n\n" + summary).strip(),
            "advance_reason": state.get("advance_reason"),
        }
        if snapshot:
            out["stage_snapshots"] = [snapshot]
        return out

    nxt = rest[0]
    stage_cfg = next((s for s in plan.get("stages", []) if s["id"] == nxt), {})
    # 未关闭的目标带进下一幕（如复述阶段没答透的难点，探究阶段优先追问）
    carried = list(state.get("unresolved") or [])
    out = {
        "host_phase": nxt,
        "remaining_stages": rest[1:],
        "stage_budget_minutes": float(stage_cfg.get("minutes", 0)),
        "advance_when": stage_cfg.get("advance_when", "either"),
        "stage_started_at": now,
        "stage_elapsed_minutes": 0.0,
        "current_target": None,
        "current_question": None,
        "pending_question": None,
        "question_queue": [],
        "q_index": 0,
        "attempts": 0,
        "mastered": [],
        "unresolved": carried if nxt in ("deep_inquiry", "class_discussion") else [],
        "active_segment_id": None,
        "reply_text": (
            reply + f"\n\n[切幕] 进入{STAGE_NAMES.get(nxt, nxt)}"
            f"（预算 {stage_cfg.get('minutes')} 分钟，advance_when={stage_cfg.get('advance_when')}）"
        ).strip(),
        "advance_reason": state.get("advance_reason"),
    }
    if snapshot:
        out["stage_snapshots"] = [snapshot]
    return out


def _ending_summary(state: ClassroomState, pending_snapshot: dict | None = None) -> str:
    stars = state.get("kp_stars") or {}
    snaps = list(state.get("stage_snapshots") or [])
    if pending_snapshot:
        snaps = snaps + [pending_snapshot]
    lines = ["[下课总结]"]
    lines.append(
        f"本课计划 {state.get('lesson_plan', {}).get('total_minutes')} 分钟，"
        f"实际上了 {state.get('lesson_elapsed_minutes')} 分钟，"
        f"共 {len(snaps)} 幕。"
    )
    if stars:
        lines.append("掌握情况：")
        for kp, st in sorted(stars.items()):
            lines.append(f"  - {kp}：{'★' * st}（{STAR_STATUS.get(st, '未检测')}）")
    open_kps = [k for k, st in stars.items() if st < 3]
    if open_kps:
        lines.append(f"建议课后补一补：{('、'.join(open_kps))}。")
    return "\n".join(lines)


def write_state(state: ClassroomState) -> dict:
    """落盘（规范第 3 节）：DIALOGUE-LOG.md + dialogue-log.json +
    mastery-state.json + mastery-history.json（追加，不覆盖历史）。"""
    try:
        _write_dialogue_log(state)
        _append_dialogue_json(state)
        _write_mastery_state(state)
        _append_mastery_history(state)
    except Exception as e:  # 落盘失败不阻断教学回复
        return {"reply_text": state.get("reply_text", "") + f"\n[warn] 落盘失败: {e}"}
    return {}


def _write_dialogue_log(state: ClassroomState) -> None:
    content = f"""# DIALOGUE-LOG

## 会话状态
- student_id: {state.get('student_id')}
- lesson_id: {state.get('lesson_id')}
- speaker: {state.get('speaker')}

### 编排器
- host_phase: {state.get('host_phase')}
- active_segment_id: {state.get('active_segment_id') or '无'}
- now: {state.get('now')}
- lesson_started_at: {state.get('lesson_started_at') or '无'}
- stage_started_at: {state.get('stage_started_at') or '无'}
- stage_elapsed_minutes: {state.get('stage_elapsed_minutes')}
- lesson_elapsed_minutes: {state.get('lesson_elapsed_minutes')}
- stage_budget_minutes: {state.get('stage_budget_minutes')}
- remaining_stages: {state.get('remaining_stages') or '无'}
- advance_reason: {state.get('advance_reason') or '无'}

### 教学
- phase: {STAGE_NAMES.get(state.get('host_phase'), state.get('host_phase'))}
- current_target: {state.get('current_target') or '无'}
- current_question: {state.get('current_question') or '无'}
- attempts: {state.get('attempts', 0)}
- mastered: {state.get('mastered') or '无'}
- unresolved: {state.get('unresolved') or '无'}

### 学生
- student_status: {state.get('student_status')}

## 本轮证据
{(chr(10) + '- ').join(state.get('turn_evidence') or ['（无）'])}

## 下次重点
- {state.get('unresolved') and '继续追问未关闭目标：' + '、'.join(state['unresolved']) or '无'}
"""
    (ROOT / "runtime/DIALOGUE-LOG.md").write_text(content, encoding="utf-8")


def _append_dialogue_json(state: ClassroomState) -> None:
    path = ROOT / "runtime/data/dialogue-log.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data["student_id"] = state.get("student_id")
    data["session_id"] = state.get("session_id")
    data["messages"].append({
        "turn_at": state.get("now"),
        "phase": state.get("host_phase"),
        "speaker": state.get("speaker"),
        "student_message": state.get("student_message", ""),
        "reply_text": state.get("reply_text", ""),
        "advance_reason": state.get("advance_reason"),
    })
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _write_mastery_state(state: ClassroomState) -> None:
    path = ROOT / "runtime/data/mastery-state.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data["student_id"] = state.get("student_id")
    data["updated_at"] = state.get("now")
    kps = data.get("knowledge_points") or {}
    for kp, stars in (state.get("kp_stars") or {}).items():
        meta = (state.get("kp_meta") or {}).get(kp, {})
        rec = kps.get(kp) or {"assessment_status": "未考核"}
        rec.update({
            "kp_id": kp,
            "stars": stars,
            "status": STAR_STATUS.get(stars, "未检测"),
            "last_source": meta.get("last_source", rec.get("last_source", "dialogue")),
            "last_stage": meta.get("last_stage", rec.get("last_stage")),
            "last_evidence": meta.get("last_evidence", rec.get("last_evidence")),
            "updated_at": state.get("now"),
        })
        kps[kp] = rec
    data["knowledge_points"] = kps
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _append_mastery_history(state: ClassroomState) -> None:
    path = ROOT / "runtime/data/mastery-history.json"
    hist = json.loads(path.read_text(encoding="utf-8"))
    existing_changes = sum(1 for h in hist if h.get("type") == "mastery_change")
    for i, upd in enumerate(state.get("mastery_updates") or [], start=1):
        hist.append({
            "type": "mastery_change",
            "history_id": f"mh-{existing_changes + i:03d}",
            "student_id": state.get("student_id"),
            **upd,
        })
    # 快照按条数去重：state 里累计的快照数多于文件里已有的 → 补写新增部分
    existing_snaps = sum(1 for h in hist if h.get("type") == "stage_snapshot")
    for snap in (state.get("stage_snapshots") or [])[existing_snaps:]:
        hist.append(snap)
    path.write_text(json.dumps(hist, ensure_ascii=False, indent=2), encoding="utf-8")


def format_reply(state: ClassroomState) -> dict:
    """组装最终回复与播报标记。"""
    reply = state.get("reply_text", "")
    return {"reply_text": reply, "speech_kind": "auto" if reply else "none"}


# ═══════════════════════════════════════════════════════════════
# 路由：判断写进 state，路由函数只读不判
# ═══════════════════════════════════════════════════════════════

def route_after_classify(state: ClassroomState) -> str:
    return "host_event" if state.get("speaker") == "host" else "teach"


def route_after_judge(state: ClassroomState) -> str:
    return "next_stage" if state.get("target_phase") else "stay"


# ═══════════════════════════════════════════════════════════════
# 建图
# ═══════════════════════════════════════════════════════════════

def build_graph(checkpointer=None):
    g = StateGraph(ClassroomState)

    g.add_node("load_plan", load_plan)
    g.add_node("tick", tick)
    g.add_node("load_context", load_context)
    g.add_node("classify_turn", classify_turn)
    g.add_node("host_event", host_event)
    g.add_node("teach", teach)
    g.add_node("judge_mastery", judge_mastery)
    g.add_node("judge_advance", judge_advance)
    g.add_node("advance_stage", advance_stage)
    g.add_node("write_state", write_state)
    g.add_node("format_reply", format_reply)

    g.add_edge(START, "load_plan")
    g.add_edge("load_plan", "tick")
    g.add_edge("tick", "load_context")
    g.add_edge("load_context", "classify_turn")

    g.add_conditional_edges(
        "classify_turn", route_after_classify,
        {"host_event": "host_event", "teach": "teach"},
    )
    g.add_edge("host_event", "judge_advance")
    g.add_edge("teach", "judge_mastery")
    g.add_edge("judge_mastery", "judge_advance")

    g.add_conditional_edges(
        "judge_advance", route_after_judge,
        {"stay": "write_state", "next_stage": "advance_stage"},
    )
    g.add_edge("advance_stage", "write_state")
    g.add_edge("write_state", "format_reply")
    g.add_edge("format_reply", END)

    return g.compile(checkpointer=checkpointer)


# ═══════════════════════════════════════════════════════════════
# 会话层接口：每轮注入 now + 学生消息，同一个 thread_id 续上
# ═══════════════════════════════════════════════════════════════

def initial_state(session_id: str, student_id: str = "student-001",
                  lesson_id: str = "ch3-process-scheduling") -> dict:
    """新会话的首轮要传完整初始 state（后续轮从 checkpoint 恢复）。"""
    return {
        "session_id": session_id,
        "student_id": student_id,
        "lesson_id": lesson_id,
        "host_phase": "uninitialized",
        "active_segment_id": None,
        "stage_started_at": None,
        "stage_elapsed_minutes": 0.0,
        "lesson_elapsed_minutes": 0.0,
        "stage_budget_minutes": 0.0,
        "remaining_stages": [],
        "advance_when": "either",
        "now": "",
        "lesson_started_at": None,
        "on_budget_exhausted": "wrap_up",
        "on_evidence_reached": "advance",
        "min_stage_minutes": 2.0,
        "max_stage_overrun_minutes": 3.0,
        "current_target": None,
        "current_question": None,
        "pending_question": None,
        "question_queue": [],
        "q_index": 0,
        "attempts": 0,
        "mastered": [],
        "unresolved": [],
        "student_message": "",
        "speaker": "student",
        "student_status": "waiting",
        "turn_evidence": [],
        "mastery_updates": [],
        "kp_stars": {},
        "kp_meta": {},
        "stage_snapshots": [],
        "reply_text": "",
        "speech_kind": "none",
        "advance_reason": None,
        "target_phase": None,
        "assembled_prompt": "",
        "lesson_plan": {},
    }


def run_one_turn(graph, session_id: str, now: str, message: str,
                 speaker: str = "student") -> dict:
    """跑一轮。返回这轮结束后的完整 state（含 reply_text）。"""
    config = {"configurable": {"thread_id": session_id}}
    if not graph.get_state(config).values:
        payload = {**initial_state(session_id)}
    else:
        payload = {}
    # 本轮新增输入最后写入，覆盖初始占位值
    payload.update({"now": now, "student_message": message, "speaker": speaker})
    graph.invoke(payload, config)
    return dict(graph.get_state(config).values)


if __name__ == "__main__":
    graph = build_graph()
    print("图编译成功，节点结构：\n")
    print(graph.get_graph().draw_ascii())
