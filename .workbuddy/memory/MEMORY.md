# 主动引导智能体 — 项目长期笔记

## 项目定位
本项目 = `Dify 课堂互动智能体`(GitHub: HELLO-APL/Dify-Classroom-Interactive-Agent)的重构版。
旧仓库 `D:\project\Dify 课堂互动智能体` 保留不动,只作参照;重构产物落在本目录。

## 核心设计约定(2026-09-17 用户确认)
- 课堂编排器 = host_phase 状态机 + 老师端配置 `lesson-data/lesson-plan.json`(阶段开关 + 每阶段/每段分钟数 + advance_policy)。AI 每轮对话内自动判断切幕,把一门课在规定时间内上完。
- 阶段枚举:intro / guided_learning / recap_discussion / deep_inquiry / class_discussion / ending;阶段可按课程配置启停。
- **学生标注功能永久移除**(point_review 幕、points/*.json、1星"已标注"、source=class_point)。
- 目录用无空格英文名:rules/ lesson-data/ runtime/ apps/ workflow/ docs/。
- 旧用户运行时记录不迁移,runtime/ 用空白模板初始化。

## 环境备注
- 本机 bash 的 PATH 缺 dirname/ls 等,需 `export PATH="/usr/bin:/bin:$PATH"` 修复;PowerShell stdout 会吞输出,优先用 bash+文件落盘。
- workbuddy.link 分享页数据可从 workbuddy-space-static.codebuddy.work/page/<id>/0/conversation-data.json 直接拉取。
