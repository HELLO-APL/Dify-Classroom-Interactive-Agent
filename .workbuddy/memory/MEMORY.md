# 主动引导智能体 — 项目长期笔记

## 项目定位
本项目 = `Dify 课堂互动智能体`(GitHub: HELLO-APL/Dify-Classroom-Interactive-Agent)的重构版。
旧仓库 `D:\project\Dify 课堂互动智能体` **保留不动**,只作参照;重构产物落在本目录,已 git init(首个提交 a0ca473)。

## 核心设计约定(2026-09-17 用户确认)
- **编排器** = `runtime/DIALOGUE-LOG.md` 的 `host_phase` 状态机 + 老师端配置 `lesson-data/lesson-plan.json`。AI 每轮读计划→判证据+判耗时→写回切幕,把一门课在规定时间内上完。
- 阶段枚举:intro / guided_learning / recap_discussion / deep_inquiry / class_discussion / ending。**阶段可按课程启停**(`enabled:false` 整段跳过),每阶段有 `minutes` 时长预算。
- `advance_when` 三值:either(证据或时间)/ evidence(学透才走)/ budget(只看时间)。
- **学生标注功能永久移除**:point_review 幕、points/*.json、1星"已标注"、source=class_point、annotation_ids、「继续」事件。
- **1 星改名为"已接触"**(AI 讲过即记),使星级在无标注情况下保持 0-5 连续。
- **掌握评分靠后三阶段表现阶段性记录**:复述(2-3星)、探究(4星)、讨论(只记快照)。新增 stage_snapshot 机制写入 mastery-history.json。
- 三阶段内容独立成 `stages/<stage>/`:questions.md(老师出题)/ rubric.md(评判标准)/ prompt.md(AI提示词),**可空壳,留空不影响运行**(有降级兜底)。
- `KNOWLEDGE-BASE.md` 新增 4 个探究字段:为什么这样设计/如何实现/解决什么实际问题/关联学科 —— 这是深层探究阶段唯一燃料。
- "区分问题" = 专用于暴露 A/B 混淆的题;易混淆点列表写在 TMISSION,区分问题写在 LESSON-INTERACTION(去重分工)。
- 目录用无空格英文名:rules/ lesson-data/ runtime/ apps/ stages/ orchestrator/ workflow/。
- 旧用户运行时记录不迁移,runtime/ 与 workspace data 用空白模板初始化。

## 关键文件
- `orchestrator/ORCHESTRATOR.md` — LangGraph 编排规范(State schema / 9 节点 / judge_advance 判定 / 分层装配 / 降级行为 / 校验清单)
- `orchestrator/MIGRATION.md` — 新旧路径映射与变更记录
- `rules/interaction/MASTERY-STAR-RULES.md` — 0-5 星唯一权威规则
- `lesson-data/lesson-plan.json` — 老师端编排入口

## 环境备注
- 本机 bash 的 PATH 缺 dirname/ls 等,需 `export PATH="/usr/bin:/bin:$PATH"` 修复;PowerShell stdout 会吞输出,优先用 bash+文件落盘。
- workbuddy.link 分享页数据可从 workbuddy-space-static.codebuddy.work/page/<id>/0/conversation-data.json 直接拉取。
