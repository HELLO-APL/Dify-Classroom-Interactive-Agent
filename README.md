# 课堂互动智能体目录说明

## 立即运行

双击：

```text
start-classroom-chat.cmd
```

课堂页面：

```text
http://127.0.0.1:4173
```

学生 workspace：

```text
http://127.0.0.1:4173/student/
```

## 运行目录，不要随意移动

| 目录 | 作用 |
| --- | --- |
| `class agent` | 老师规则、格式、知识点目录，n8n 每轮只读 |
| `class-point` | 课程片段与学生标记点 |
| `teach test` | 当前课堂状态与对话状态，n8n 每轮读写 |
| `classroom-chat` | 新课堂聊天页面、语音代理与本地配置 |
| `student-workspace` | 学生 workspace 页面与长期学习档案，读取现有知识点、标注和掌握数据 |

这些路径已经写进 n8n 或启动脚本，移动后会导致页面或工作流找不到文件。

## 工作流

| 路径 | 作用 |
| --- | --- |
| `workflow/n8n-build/teach-workflow.mjs` | 当前 n8n 工作流的生成源码 |
| `workflow/N8N-TEACH-PROMPT.txt` | `Teach Session Agent` 系统提示词的人可读副本 |
| `workflow/n8n-build/mcp_call.mjs` | n8n MCP 开发辅助脚本 |
| `workflow/n8n-build/file-io-test.mjs` | n8n 文件读写测试脚本 |

真正的运行时提示词保存在 n8n 数据库的 `Teach Session Agent` 节点中。
修改源码或副本不会自动修改当前运行的 n8n 工作流。

## 文档

| 路径 | 内容 |
| --- | --- |
| `docs/PROJECT-SPEC.md` | 当前系统完整说明 |
| `docs/ARCHITECTURE-BRIEF.md` | 系统架构摘要 |
| `docs/DATA-INVENTORY.md` | 数据输入输出清单 |
| `docs/DATABASE-MODEL.md` | 数据库设计草案 |
| `docs/DATABASE-SCHEMA.sql` | 数据库 SQL 草案 |
| `class agent/class-interaction/MASTERY-STAR-RULES.md` | 标注、答疑证据与 0-5 星掌握度的唯一换算规则 |

## 归档

`archive` 保存旧实验和生成物，不参与当前运行：

- `archive/matt teach skill`
- `archive/outputs`
- `archive/新建文件夹`
- `archive/课堂互动智能体数据说明.docx`

## 本次整理前的旧位置

| 旧位置 | 新位置 |
| --- | --- |
| `.n8n-build` | `workflow/n8n-build` |
| `N8N-TEACH-PROMPT.txt` | `workflow/N8N-TEACH-PROMPT.txt` |
| 根目录架构与数据库文档 | `docs` |
| `matt teach skill` | `archive/matt teach skill` |
| `outputs` | `archive/outputs` |
| `新建文件夹` | `archive/新建文件夹` |
| `课堂互动智能体数据说明.docx` | `archive/课堂互动智能体数据说明.docx` |
