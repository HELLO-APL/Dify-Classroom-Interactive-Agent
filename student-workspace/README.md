# 学生 workspace

## 页面入口

先启动课堂服务：

```powershell
node .\classroom-chat\server.mjs
```

打开：

```text
http://127.0.0.1:4173/student/
```

## 页面结构

- `课程中心`：课程列表；进入课程后显示预留视频区域和原课堂对话框。
- `掌握情况`：知识点来自 `class agent/KNOWLEDGE-BASE.md`；未检测不显示星星；标注最低 1 星；正式考核通过才到 5 星。当前掌握与历史变化分表展示。
- `查缺补漏`：先选课程，再列出打过标注的知识点；复习详细板块保留为占位。
- `标注记录`：单独展示 `class-point/points` 中的原始标注，可按课程和状态筛选。

## 数据文件

```text
data/mastery-state.json       当前星级、状态、标注关联、最近证据
data/mastery-history.json     星级与状态变化历史，只追加
data/dialogue-log.json        学生与 AI 的完整问答记录
```

知识点目录和课程片段仍以原目录为准：

```text
class agent/KNOWLEDGE-BASE.md
class-point/segments/*.json
class-point/points/*.json
```

## 星级规则

权威规则位于：

```text
class agent/class-interaction/MASTERY-STAR-RULES.md
```

页面只执行该规则，不在前端复制另一套评分标准。
