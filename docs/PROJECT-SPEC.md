# teach 多轮课堂互动智能体：当前项目完整说明

更新时间：2026-09-06  
用途：作为本项目当前唯一完整的实现说明。以后新增功能、修改流程、移植到其他平台时，都以此文档为基准。

## 1. 项目目标

本项目是一个“单学生课堂互动智能体”，跑在本机 n8n 上，由 Chat Trigger 驱动。每轮对话：

1. 读取 `class agent` 中的课堂规则与格式文档；
2. 读取 `teach test` 中的学生状态 md；
3. 根据当前 `phase` 决定是进入对话、要求补齐材料，还是提示本课已结束；
4. 对话过程中只从状态文件找难点、易混淆点和兴趣点，不凭空提问；
5. 每轮把证据写入 `DIALOGUE-LOG.md`；
6. 学生输入 `/结束` 后汇总证据、更新各状态文件，并把 `phase` 置为 `ended`。

第一版只支持一个学生，固定为 `student_id = student-001`，但所有状态文件保留 `student_id` 字段，后续可扩展为多学生。

## 2. 当前运行环境

- n8n：本机 Docker 部署，地址 `http://localhost:5678`
- 工作流名称：`teach`
- 工作流编辑地址：`http://localhost:5678/workflow/jB1zQp2zlHb3Fwk6`
- Chat 页面：`http://localhost:5678/webhook/24c2ba65-8779-45a1-86d8-8c6ab4f824eb/chat`
- 模型：DeepSeek `deepseek-chat`，通过 n8n 凭据 `DeepSeek account` 调用
- 聊天记忆：n8n Simple Memory，按 Chat Trigger 的 `sessionId` 保存最近 20 轮对话

### Docker 挂载

宿主机目录：

```text
D:\project\Dify 课堂互动智能体
```

容器内路径：

```text
/data/class-teach
```

因此容器内的实际路径是：

```text
/data/class-teach/class agent
/data/class-teach/teach test
```

## 3. 文件边界

### 3.1 规则目录（只读）

```text
D:\project\Dify 课堂互动智能体\class agent
```

工作流读取：

```text
/data/class-teach/class agent/**/*.md
```

该目录下包含：

- `class-interaction/SKILL.md`：课堂总规则
- `class-interaction/TMISSION-FORMAT.md`：全班任务格式
- `class-interaction/SMISSION-FORMAT.md`：学生个人任务格式
- `class-interaction/LESSON-INTERACTION-FORMAT.md`：本课内容与易混淆点格式（存储老师上传的文件）
- `class-interaction/NOTES-FORMAT.md`：笔记和工作观察格式
- `class-interaction/GLOSSARY-FORMAT.md`：精确词汇格式
- `class-interaction/LEARNING-RECORD-FORMAT.md`：持久学习记录格式
- `class-interaction/DIALOGUE-LOG-FORMAT.md`：对话证据格式
- `class-interaction/RESOURCES-FORMAT.md`：资源格式
- `dialogue/SKILL.md`：单轮对话规则

规则目录只能读，不能写。需要修改课堂规则时，直接改本机文件或老师端材料，不能由 AI 通过状态更新覆盖。

### 3.2 状态目录（可读写）

```text
D:\project\Dify 课堂互动智能体\teach test
```

工作流读取并写入：

```text
/data/class-teach/teach test/*.md
```

状态文件：

- `TMISSION.md`：老师对全班的 mission
- `SMISSION.md`：学生自己的 mission
- `NOTES.md`：学生偏好与 AI 工作观察
- `LESSON-INTERACTION.md`：本节课内容和易混淆点（单轮--对应每节课，而不是结合整个学期的知识点）
- `GLOSSARY.md`：有真实理解证据才写词条
- `LEARNING-RECORD.md`：有真实学习证据才写持久记录
- `DIALOGUE-LOG.md`：每轮对话证据与 session control

## 4. 工作流节点结构

当前 n8n 工作流的实际顺序：

```text
Chat Trigger
  -> Normalize Input
  -> Check Uploaded File（IF 判断是否有上传文件）
       true  -> Extract Uploaded Text
               -> Attach Upload Context
               -> Merge（上传分支）
       false -> Merge（无文件分支）
  -> Read Rule Files
     -> Extract Rule Files
     -> Merge（规则分支）
  -> Read State Files
     -> Extract State Files
     -> Merge（状态分支）
  -> Combine Context
  -> Teach Session Agent
     - DeepSeek Chat Model
     - Teach Chat Memory（Simple Memory）
  -> Parse Agent JSON
  -> Prepare State Writes
  -> State Markdown to Binary
  -> Write State Files
  -> Format Chat Reply
```

`Format Chat Reply` 输出 `{ output: "给学生看的内容" }`，作为 Chat Trigger 的回复。

## 5. 触发与输入

### 5.1 Chat Trigger

- `mode: hostedChat`
- `responseMode: lastNode`
- `allowFileUploads: true`

### 5.2 每轮输入

| 字段 | 含义 | 当前状态 |
| --- | --- | --- |
| `student_message` | 学生文字 | Chat 输入框直接提供 |
| `file_input` | 本轮文件 | 可为空，通过 Chat 上传 |
| `teacher_material` | 老师端新材料 | 字段已预留；本地 Chat 目前主要用文件上传承载，网站/接口数据待后续平台接入 |
| `student_id` | 学生标识 | 第一版固定 `student-001` |

## 6. 完整流程

### 6.1 读取规则和状态

每轮先读取 `class agent` 规则和 `teach test` 状态，全部放进模型上下文。

状态文件缺失，或仍是“待老师提供”占位时：

- 不开始提问；
- 说明缺哪个文件；
- 要求老师或学生补齐。

不允许凭空编造老师目标、课程难点或学生掌握证据。

### 6.2 老师材料或文件

本轮带文件时，先提取文本。

上传处理规则：

- 如果上传文件名精确等于七个状态文件之一，且正文像完整 md，就把该文件内容写入对应状态文件，本轮只确认收到，不进入提问；
- 其他文件一律按“备课/学习材料”处理，把正文写入 `LESSON-INTERACTION.md` 的老师端输入区，注明来源；
- 本轮不进入学生提问。

`teacher_material` 将来接入网站、PDF、接口数据时，按同样的备课处理逻辑写入 `LESSON-INTERACTION.md` 的老师端输入区。

### 6.3 判断 phase

`DIALOGUE-LOG.md` 中维护 `phase`：

- `未初始化`：要求补齐初始 md，不开始提问；
- `dialogue`：进入课堂对话；
- `ended`：提示本课已结束，新一轮需要重新准备。

### 6.4 对话模式

对话内容必须可追溯到状态文件：

- 从 `TMISSION.md` 找本课难点，做针对性提问；
- 从 `LESSON-INTERACTION.md` 找易混淆点，向学生提问；
- 从 `SMISSION.md` 找兴趣点，只在能连接本课时询问；
- 学生答对：简短确认，记录证据，推进；
- 部分答对：先确认对的部分，再追问更小缺口；
- 答错：先给提示，不直接讲答案；
- 同一题两次没答对：换策略或降难度；
- 学生输入 `/wait-what`：不引入新材料，把上一步拆小重讲，再做一个简短理解检查；
- 学生输入 `/research`：调用预留 research 工具或占位逻辑，答案必须标注来源；
- 学生输入 `/帮助`：显示帮助菜单；
- 每轮证据写入 `DIALOGUE-LOG.md`。

每次只问一个问题。下一个问题必须来自更新后的 session control，不能循环同一个问题。

### 6.5 Glossary 使用方式

`GLOSSARY.md` 是 AI 的精确表达参考，不是学生的语言考试：

- 学生用自己的话说清楚就接受；
- AI 只在有助于解释、比较或提问时引入 glossary 词；
- 学生正确使用一个词且理解成立时，记录为 glossary candidate；
- `/结束` 时，只在有真实理解证据时新增或修订 `GLOSSARY.md`。

### 6.6 会话控制和主动引导

每轮回答后更新：

- `current_target`
- `current_question`
- `attempts`
- `mastered`
- `unresolved`
- `wait_what_used`
- `research_used`
- `help_used`

有掌握证据就关闭当前目标并切换；两次失败就换方式；下一问必须来自更新后的会话控制。

### 6.7 帮助菜单

学生输入 `/帮助` 时提供：

1. 给一个提示，但不要讲完整答案
2. 换一个例子
3. 换一种说法重新讲
4. 讲慢一点，拆成更小步骤
5. 先换一道更简单的题
6. 今天先到这里

学生选择后只执行所选帮助，然后根据更新后的会话状态选择下一个问题。

### 6.8 学生未回应阶梯

本地第一版先由人工或测试消息驱动，以后由定时器或平台事件调用。

- 第一次未回应：问“你卡住了、需要帮助、在练习，还是想休息？”，给出选项；
- 第二次仍未回应：发送帮助菜单；
- 第三次仍未回应：停止追问，说明可回复 `/继续` 或 `/结束`，状态置为 `waiting`；
- 学生选“在练习”：停止追问，等待学生回来；
- 学生之后回复：重置未回应阶梯。

当前落地情况：

- `inactivity_step`、`student_status` 等状态字段已纳入 `DIALOGUE-LOG.md`；
- Chat Trigger 本身不会自动唤醒；
- 后续接入平台事件、定时器或 manual trigger 后，再按同一套阶梯触发。

### 6.9 `/结束` 收尾

收到 `/结束` 后：

- LLM 汇总本课证据；
- 更新 `SMISSION.md` 进度；
- 更新 `NOTES.md`，只记录偏好和工作观察；
- 有真实证据时更新 `GLOSSARY.md`；
- 有真实学习证据时更新 `LEARNING-RECORD.md`；
- 更新 `DIALOGUE-LOG.md`；
- 未解决难点写入下一次重点；
- 生成更新后的状态 md；
- `phase` 置为 `ended`；
- 回复给学生一份简短更新摘要。

## 7. 聊天记忆

这是后来补充并已落地的功能，用来解决“AI 重复问同一句话”的问题。

- 使用 n8n Simple Memory 节点；
- 节点类型：`@n8n/n8n-nodes-langchain.memoryBufferWindow`；
- 按 Chat Trigger 的 `sessionId` 区分会话；
- 上下文窗口：最近 20 轮；
- AI 每轮既能看到状态文件，也能看到同一会话内最近的逐字对话。

注意事项：

- 刷新页面或新开聊天页后，Simple Memory 会从空会话开始；
- 跨会话的连续教学由 `DIALOGUE-LOG.md` 和其余状态 md 承担；
- 如果希望刷新页面后也保留逐字历史，需要把最近几轮对话再写进 `DIALOGUE-LOG.md` 或单独的历史文件。

## 8. 文件写入规则

- `class agent`：只读；
- `teach test`：状态文件可读写；
- 更新 md 时只改有证据支持的部分，保留未改动章节；
- `dialogue_log_md` 每轮必须非空，包含完整更新后的 `DIALOGUE-LOG.md`；
- 其他状态字段不需要改写时返回空字符串，避免无证据覆盖；
- 每次保存前应做一次文件状态确认，防止并发或多轮写覆盖。

## 9. 当前课程初始化状态

当前 `teach test` 已按老师提供的《计算机操作系统（慕课版第2版）》教学大纲和第3章课件初始化：

- `TMISSION.md`：第3章处理机调度的全班任务、难点、易混淆点；
- `LESSON-INTERACTION.md`：第3章学生已会、新内容、易混淆点、任务、成功证据；
- `SMISSION.md`：基于学生主动说“我不懂调度策略”的初步个人目标；
- `NOTES.md`：记录课程初始化和学生的初始卡点；
- `DIALOGUE-LOG.md`：`phase: dialogue`，并带有当前 session control；
- `GLOSSARY.md`：暂无词条；
- `LEARNING-RECORD.md`：暂无持久学习记录。

以后换新课、换学生、换老师目标时：

- 老师直接修改/替换 `teach test` 下的对应状态 md；
- 或在聊天中上传同名的完整状态 md；
- 或使用老师端材料上传，由工作流把内容写入 `LESSON-INTERACTION.md`。

## 10. 可复用/可移植说明

这套说明不只绑定 n8n：

- 对话规则本身来自 `class agent` 下的 skill；
- 学生状态模型来自 `teach test` 下的七个 md；
- n8n 只负责“Chat Trigger + LLM + 文件读写 + 记忆 + 回复”的壳；
- 以后移植到 Dify、n8n 新实例、CodeBuddy 或其他工作流平台时，保留文件边界和流程语义即可。

当前仍存在的问题：
1. 记忆功能目前只有 20 轮。
2. 掌握情况已迁移到 `mastery-state.json` 和 `mastery-history.json`，采用 0-5 星与当前/历史分层，不再以 md 作为唯一来源。
3. 定时器没有，需要手动触发，不能自动接话。
4. 学生 workspace 已实现课程、掌握、查缺补漏和标注记录页面；跨平台接口和视频位置仍需后续接入。

需要提供：
老师的教学计划、课件、讲稿（可分知识点引用，让ai读取）
