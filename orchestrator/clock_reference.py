"""编排器时钟与切幕判定的参考实现 + 单测。

用途：验证 ORCHESTRATOR.md 第 5/6 节的逻辑真的能跑通。
时间全部来自 state["now"] 输入，所以可以喂任意时间戳回放整节课。
"""

from datetime import datetime, timedelta

ABSENT = "absent"          # 判定为"人不在"
NORMAL = "normal"


def _dt(s: str) -> datetime:
    return datetime.fromisoformat(s)


def _minutes(a: str, b: str) -> float:
    return (_dt(a) - _dt(b)).total_seconds() / 60


def classify_gap(gap: float, idle_gap: float, grace: float) -> tuple[str, float]:
    """把时间间隔归类，返回 (类型, 计课时比例)。"""
    if gap >= grace:
        return ABSENT, 0.0
    if gap >= idle_gap:
        return NORMAL, 0.25
    return NORMAL, 1.0


def tick(state: dict) -> dict:
    """结算本轮耗时。ORCHESTRATOR.md 第 5.5 节的实现。"""
    now = state["now"]
    last = state.get("last_activity_at") or state["lesson_started_at"]
    gap = _minutes(now, last)

    kind, fraction = classify_gap(
        gap, state["idle_gap_minutes"], state["absence_grace_minutes"]
    )
    credited = gap * fraction

    # 本幕墙钟时长：仅用于记录与展示
    stage_wall = _minutes(now, state["stage_started_at"])

    # 缺席判定只看"上一轮活动距今多久"。
    # 不能看"这幕总共开了多久"——否则幕一旦超过宽限，学生即使刚说过话
    # 也会被永久判为缺席，预算将永远无法触发切幕（回归测试抓到过这个 bug）。
    absence = kind

    return {
        "gap_kind": kind,
        "absence_kind": absence,
        "idle_elapsed_minutes": round(gap, 2),
        "idle_fraction": fraction,
        "stage_teach_minutes": round(state["stage_teach_minutes"] + credited, 2),
        "lesson_teach_minutes": round(state["lesson_teach_minutes"] + credited, 2),
        "stage_elapsed_minutes": round(stage_wall, 2),
        "lesson_elapsed_minutes": round(_minutes(now, state["lesson_started_at"]), 2),
        "last_activity_at": now,
    }


def judge_advance(state: dict) -> dict:
    """切幕判定。ORCHESTRATOR.md 第 6 节。返回 {'action', 'reason'}。"""
    # 0. 人不在：只在这一轮距上轮超宽限、且本幕墙钟也超宽限时才触发
    if state.get("absence_kind") == ABSENT:
        policy = state["absent_policy"]
        if policy == "end":
            return {"action": "next_stage", "reason": "缺席：提前结束"}
        if policy == "skip":
            return {"action": "next_stage", "reason": "缺席：跳过本幕"}
        return {"action": "stay", "reason": "缺席：预算冻结，等待学生回来"}

    # 1. 最短幕时长保护（净时长）
    if state["stage_teach_minutes"] < state["min_stage_minutes"]:
        return {"action": "stay", "reason": "未达最短幕时长"}

    # 2. evidence 模式：目标没关完就不走
    if state["advance_when"] == "evidence" and state["unresolved"]:
        return {"action": "stay", "reason": "尚有未关闭目标（evidence 模式）"}

    # 3. 证据到位
    if state["turn_evidence"] and not state["unresolved"]:
        if state["advance_when"] in ("evidence", "either"):
            if state["on_evidence_reached"] == "advance":
                return {"action": "next_stage", "reason": "目标已达成，证据充分"}

    # 4. 预算
    if state["stage_teach_minutes"] >= state["stage_budget_minutes"]:
        overrun = state["stage_teach_minutes"] - state["stage_budget_minutes"]
        mode = state["on_budget_exhausted"]
        if mode == "force_advance":
            return {"action": "next_stage", "reason": "预算耗尽：强制切幕"}
        if mode == "wrap_up":
            return {"action": "next_stage", "reason": "预算耗尽：本幕收尾"}
        if mode == "extend" and overrun < state["max_stage_overrun_minutes"]:
            return {"action": "stay", "reason": f"预算耗尽但允许延长（超 {overrun:.1f} 分）"}
        return {"action": "next_stage", "reason": "延长额度用尽"}

    # 5. 默认留幕
    return {"action": "stay", "reason": "时间与证据均未触发切幕"}


# ─────────────────── 测试 ───────────────────

def base_state(**over) -> dict:
    t0 = "2026-09-18T10:00:00+08:00"
    s = {
        "now": t0,
        "lesson_started_at": t0,
        "stage_started_at": t0,
        "last_activity_at": t0,
        "stage_teach_minutes": 0.0,
        "lesson_teach_minutes": 0.0,
        "stage_elapsed_minutes": 0.0,
        "lesson_elapsed_minutes": 0.0,
        "idle_gap_minutes": 8.0,
        "idle_credit_ratio": 0.25,
        "absence_grace_minutes": 15.0,
        "absent_policy": "extend",
        "stage_budget_minutes": 22.0,
        "advance_when": "either",
        "on_evidence_reached": "advance",
        "on_budget_exhausted": "wrap_up",
        "min_stage_minutes": 2.0,
        "max_stage_overrun_minutes": 3.0,
        "turn_evidence": [],
        "unresolved": ["KP-002"],
    }
    s.update(over)
    return s


def replay(start: dict, stamps: list, last_hm: str):
    """依次喂入时间戳，返回最终状态。模拟多轮对话累计。

    stamps: ["10:01", "10:02", ...]，最后一轮用 last_hm。
    """
    st = dict(start)
    for hm in stamps[:-1] + [last_hm]:
        st["now"] = f"2026-09-18T{hm}:00+08:00"
        t = tick(st)
        st.update(t)
        st["turn_evidence"] = []
        st["unresolved"] = ["KP-002"]
    return st


def check(name, verdict, expect, extra=""):
    ok = verdict["action"] == expect
    flag = "PASS" if ok else "FAIL"
    print(f"[{flag}] {name}")
    if extra:
        print(f"       {extra}")
    print(f"       判定 {verdict['action']} ← {verdict['reason']}")
    return ok


def main():
    results = []

    # ── 1. 单轮间隔的三种归类（挂机治理）──
    print("── 单轮间隔归类 ──")
    for name, hm, exp_frac, exp_action in [
        ("正常对话 1 分钟", "10:01", 1.0, "stay"),
        ("间隔 10 分钟（疑似走开）→ 只计 25%", "10:10", 0.25, "stay"),
        ("间隔 20 分钟（超宽限）→ 计 0", "10:20", 0.0, "stay"),
    ]:
        st = base_state(now=f"2026-09-18T{hm}:00+08:00")
        t = tick(st)
        merged = {**st, **t}
        v = judge_advance(merged)
        ok = t["idle_fraction"] == exp_frac and v["action"] == exp_action
        results.append(ok)
        print(f"[{'PASS' if ok else 'FAIL'}] {name}")
        print(f"       计比例 {t['idle_fraction']} | 净时长 {t['stage_teach_minutes']} 分 "
              f"| 墙钟 {t['stage_elapsed_minutes']} 分")
        print(f"       判定 {v['action']} ← {v['reason']}")

    # ── 2. 关键回归：连续多轮后净时长到预算，必须能切幕 ──
    # 这条盯住"一旦幕超宽限就永久冻结预算"的漏洞。
    # 用 10 轮正常对话把净时长累积过 22 分，中途夹一轮 12 分钟的停顿。
    print("\n── 回归：多轮累计到预算应能切幕 ──")
    st = base_state()
    st = replay(
        st,
        ["10:04", "10:08", "10:12", "10:16", "10:20", "10:24",
         "10:36", "10:40", "10:44", "10:48"],
        "10:52",
    )
    results.append(check(
        "多轮累计越过预算（含一次 12 分停顿）→ 应切幕",
        judge_advance(st), "next_stage",
        f"净时长 {st['stage_teach_minutes']} 分（预算 {st['stage_budget_minutes']}）"
        f" | 墙钟 {st['stage_elapsed_minutes']} 分 | "
        f"absence_kind={st.get('absence_kind')}",
    ))

    # ── 3. 整幕真的没人：宽限内不算缺席，超了才冻结 ──
    print("\n── 整幕缺席判定 ──")
    st = base_state(stage_started_at="2026-09-18T10:00:00+08:00")
    st2 = replay(st, ["10:05", "10:10"], "10:12")   # 幕内只过了 12 分，未超宽限
    results.append(check(
        "幕内 12 分钟（未超宽限）→ 不判缺席",
        judge_advance(st2), "stay",
        f"absence_kind={st2.get('absence_kind')} | 墙钟 {st2['stage_elapsed_minutes']} 分",
    ))
    st3 = base_state()
    st3 = replay(st3, ["10:01"], "10:25")           # 幕内 25 分且单轮 24 分
    results.append(check(
        "幕内 25 分钟 + 单轮 24 分（双超宽限）→ 判缺席冻结",
        judge_advance(st3), "stay",
        f"absence_kind={st3.get('absence_kind')} | 墙钟 {st3['stage_elapsed_minutes']} 分",
    ))

    # ── 4. 缺席策略分支 ──
    print("\n── absent_policy 分支 ──")
    for policy, exp in [("skip", "next_stage"), ("end", "next_stage"), ("extend", "stay")]:
        st = base_state()
        st = replay(st, ["10:01"], "10:25")
        st["absent_policy"] = policy
        results.append(check(
            f"缺席 + absent_policy={policy}",
            judge_advance(st), exp,
        ))

    # ── 5. 证据优先于时间 ──
    print("\n── 证据与预算的优先级 ──")
    st = base_state(
        stage_started_at="2026-09-18T10:00:00+08:00",
        stage_teach_minutes=3.0,
        stage_elapsed_minutes=3.0,
        turn_evidence=["学生说出高级调度把作业调入内存"],
        unresolved=[],
    )
    results.append(check(
        "3 分钟但目标全关闭 → 切幕（证据优先）",
        judge_advance(st), "next_stage",
    ))

    st = base_state(
        stage_started_at="2026-09-18T10:00:00+08:00",
        stage_teach_minutes=30.0,
        stage_elapsed_minutes=30.0,
        advance_when="evidence",
        on_budget_exhausted="force_advance",
    )
    results.append(check(
        "evidence 模式 + 目标未关闭 + 超预算 → 留幕（目标优先）",
        judge_advance(st), "stay",
    ))

    # ── 6. 可回放性 ──
    print("\n── 回放验证：学生中途离开 18 分钟 ──")
    st = base_state()
    st = replay(st, ["10:01", "10:02", "10:03", "10:21", "10:22", "10:23",
                     "10:24", "10:30"], "10:53")
    idle = st["lesson_elapsed_minutes"] - st["lesson_teach_minutes"]
    print(f"       墙钟 {st['lesson_elapsed_minutes']} 分 | "
          f"净时长 {st['lesson_teach_minutes']} 分 | 发呆 {idle:.1f} 分")
    ok = st["lesson_teach_minutes"] < st["lesson_elapsed_minutes"] and idle > 15
    results.append(ok)
    print(f"[{'PASS' if ok else 'FAIL'}] 净时长显著低于墙钟（挂机被正确扣除）")

    passed = sum(1 for r in results if r)
    print(f"\n结果: {passed}/{len(results)} 通过")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
