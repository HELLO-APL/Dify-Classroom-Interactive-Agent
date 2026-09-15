# 课堂上实时引导学生互动的主动 AI Agent：GitHub 项目与公开案例调研

> 调研日期：2026-08-31。所有条目均通过 `curl` 直接访问第一手来源（GitHub 仓库 README/源码、arXiv 论文页、产品官网/官方文档页）验证，页面可访问且引用文字来自原文。未能验证的候选项目一律未收录。

## 一句话调研结论

目前没有发现一个完全匹配“课堂上实时主动引导学生互动”的开源成熟产品，但存在清晰可复用的三层实现路径：用知识状态模型（BKT/知识空间/掌握度投影）驱动自动出题与介入，用 LLM 对话做苏格拉底式追问而不是直接给答案，用课堂内容（课件/教材/知识库）做 grounded 的实时问答与出题；这些能力可以组合进我们本地、单用户、以文件为状态的学生端。

## 项目/案例清单

### 1. OATutor

- 官方链接：<https://github.com/CAHLR/OATutor>（官网：<https://www.oatutor.io/>）
- 类型：开源项目（研究支撑的智能辅导系统，CHI 2023 论文）
- 做什么：React 实现的开源自适应辅导系统，使用 Bayesian Knowledge Tracing（BKT）估算技能掌握度；内容来自 OpenStax 教材和课堂 syllabus，带分级 hints/scaffolds，支持 Firebase 日志、LMS 集成，已在课堂试点。
- 如何做到主动互动：每次作答后更新 BKT 掌握度，并按“先补最弱技能”的启发式自动选择下一题；答错可自动把学生强制带入提示路径（`giveHintOnIncorrect`）；提示按 hint → scaffold → solution 递进，还可 TTS 朗读。
- 第一手依据（原文引用）：
  - README：“Adaptive item selection - Pick items to master weakest skills”
  - README：“giveHintOnIncorrect: controls whether an incorrect response should automatically force the user into the hint pathway”
  - README：“As of Fall 2024, these materials have been piloted in classrooms”
  - 来源：<https://github.com/CAHLR/OATutor#readme>

### 2. ClassroomLM（Tech@NYU）

- 官方链接：<https://github.com/TechAtNYU/ClassroomLM>
- 类型：开源项目
- 做什么：为每个课堂创建独立的 RAG 知识库（PPT、PDF、手写笔记等），提供课堂专属 LLM 助教；支持个人问答、协作群聊（`/ask`）、自动生成复习材料与试题。
- 如何做到主动互动：群聊复习场景中助手会连续出题、逐题等待评价（README 明确描述“keep giving new questions one-by-one within a group review session and waiting till the end to evaluate”）；回答 grounded 在该课堂知识库，并作为“完整对话参与者”而非一次性问答机器人。
- 第一手依据（原文引用）：
  - README：“it successfully understands that it needs to keep giving new questions one-by-one within a group review session and waiting till the end to evaluate”
  - README：“act like a full participant in the conversation, rather than just a bot that you Q&A one-off messages”
  - 来源：<https://github.com/TechAtNYU/ClassroomLM#readme>

### 3. GenMentor

- 官方链接：<https://github.com/GeminiLight/gen-mentor>（论文：<https://arxiv.org/abs/2501.15749>）
- 类型：开源论文实现（WWW 2025 Industry Track Oral）
- 做什么：LLM 驱动的多 agent 目标导向学习框架，包含 Skill Gap Identifier、Adaptive Learner Modeler、Learning Path Scheduler、Tailored Content Generator、AI Chatbot Tutor 五个模块。
- 如何做到主动互动：README 的 ITS 范式对比表中明确把“Proactive planning; personalized paths; goal-aligned assessments”作为目标导向 ITS 的核心特征；先识别技能缺口，再调度个性化学习路径和评估，而不是被动等学生提问。
- 第一手依据（原文引用）：
  - README 对比表：“Goal-oriented ITS | Proactive planning; personalized paths; goal-aligned assessments”
  - README：“Skill Gap Identifier: Analyzes learner's current knowledge to identify gaps”
  - 来源：<https://github.com/GeminiLight/gen-mentor#readme>

### 4. Civil AI

- 官方链接：<https://github.com/zhangl1001/civil-ai>
- 类型：开源项目（本地优先自适应教育 Agent 基础实现 + 公考参考应用）
- 做什么：本地优先（SQLite/IndexedDB）的 provider-neutral 自适应辅导 Agent 基础层，把 Agent 运行、学习证据、掌握度、计划、结构化内容、持久化与安全边界分离；参考应用覆盖每日计划、错题诊断、间隔复习等完整学习闭环。
- 如何做到主动互动：README 明确“deterministic learning evidence and an adaptive tutoring Agent jointly decide what a learner should study, practise, review, or revisit next”；即由学习证据和掌握度投影主动决定“下一步学什么”，而不是只基于聊天历史。
- 第一手依据（原文引用）：
  - README：“deterministic learning evidence and an adaptive tutoring Agent jointly decide what a learner should study, practise, review, or revisit next”
  - README：“Evidence before autonomy: the agent can make teaching decisions, while deterministic services own scores, state transitions, validation, and persistence”
  - 来源：<https://github.com/zhangl1001/civil-ai#readme>

### 5. Tutor CoPilot（Stanford）

- 官方链接：论文 <https://arxiv.org/abs/2410.03017>；官方 demo 代码 <https://github.com/rosewang2008/tutor-copilot>
- 类型：开源论文实现（研究项目，含 demo code 与视频教程）
- 做什么：在真人实时辅导（live tutoring）过程中给辅导老师提供专家级实时建议，是首个在真实在线课堂辅导中做随机对照试验的 Human-AI 系统（900 名辅导老师、1800 名 K-12 学生）。
- 如何做到主动互动：摘要明确系统“provides expert-like guidance to tutors as they tutor”；研究结果显示使用该系统的老师更常使用“asking guiding questions”等高质量教学策略，更少直接给学生答案。
- 第一手依据（原文引用）：
  - arXiv 摘要：“a novel Human-AI approach that leverages a model of expert thinking to provide expert-like guidance to tutors as they tutor”
  - arXiv 摘要：“tutors with access to Tutor CoPilot are more likely to use high-quality strategies to foster student understanding (e.g., asking guiding questions) and less likely to give away the answer”
  - 来源：<https://arxiv.org/abs/2410.03017>、<https://github.com/rosewang2008/tutor-copilot#readme>

### 6. Coding-Tutor / Traver

- 官方链接：<https://github.com/iwangjian/Coding-Tutor>（论文：<https://arxiv.org/abs/2502.13311>）
- 类型：开源论文实现（ACL 2025 Findings）
- 做什么：面向编程辅导的对话式 tutoring agent 工作流 Traver（Trace-and-Verify），包含知识追踪与逐轮校验 verifier；并发布 DICT 评估协议，用模拟学生+编码测试自动评估辅导效果。
- 如何做到主动互动：README 指出这类任务型辅导 agent 必须“adapt content to users' varying levels of background knowledge”；逐轮校验 tutor 回复是否推进学生理解，属于研究/评估型实现，不是课堂产品。
- 第一手依据（原文引用）：
  - README：“the tutor must adapt content to users' varying levels of background knowledge”
  - README：“propose Trace-and-Verify (Traver), an effective agent workflow that incorporates knowledge tracing and turn-by-turn verification”
  - 来源：<https://github.com/iwangjian/Coding-Tutor#readme>

### 7. Khanmigo（Khan Academy）

- 官方链接：<https://www.khanmigo.ai/>
- 类型：商业产品案例（Khan Academy 官方产品页）
- 做什么：Khan Academy 的 AI 助教与个人辅导老师，整合 Khan Academy 内容库；面向学生提供 tutor、study buddy 等角色，面向教师提供备课、学生作业总结、学习目标与 exit ticket 生成；课堂/学区场景通过 Khan Academy 校区合作提供。
- 如何做到主动互动：官方页面明确“Khanmigo challenges you to think critically and solve problems without giving you direct answers”“guides learners to find the answer themselves”；即用提问与引导让学生自己得出答案，而不是直接给结论。
- 第一手依据（原文引用）：
  - 官网：“Khanmigo challenges you to think critically and solve problems without giving you direct answers”
  - 官网：“Khanmigo doesn't just give answers. Instead, with limitless patience, it guides learners to find the answer themselves”
  - 来源：<https://www.khanmigo.ai/>

### 8. MATHia + LiveLab（Carnegie Learning）

- 官方链接：<https://www.carnegielearning.com/solutions/math/mathia>
- 类型：商业产品案例（Carnegie Learning 官方产品页）
- 做什么：面向 6-12 年级的 AI 数学辅导软件，课堂内使用；按技能粒度做自适应，并提供教师端 LiveLab 实时课堂辅助工具。
- 如何做到主动互动：官方页面原文“personalized just-in-time feedback and contextual hints”“uses sophisticated AI technology to adapt at a very detailed, skill-by-skill level”；LiveLab 提供“real-time alerts notify you when students need extra support and lets students know when they've reached math milestones”，即实时识别需要帮助的学生并提示里程碑。
- 第一手依据（原文引用）：
  - 官网：“Students stay engaged with MATHia's personalized just-in-time feedback and contextual hints. MATHia uses sophisticated AI technology to adapt at a very detailed, skill-by-skill level.”
  - 官网：“LiveLab ... Real-time alerts notify you when students need extra support and lets students know when they've reached math milestones.”
  - 来源：<https://www.carnegielearning.com/solutions/math/mathia>

### 9. ALEKS（McGraw Hill）

- 官方链接：<https://www.aleks.com/about_aleks>
- 类型：商业产品案例（ALEKS 官方 About 页）
- 做什么：基于知识空间理论（Knowledge Space Theory）与机器学习的测评+学习系统，为每个学生维护知识地图，并动态选择题目。
- 如何做到主动互动：官方页面原文“questions chosen by ALEKS based on their responses to all previous questions”，即每题都由前序回答决定；“offers the student a selection of the topics that they are currently ready to learn”；Knowledge Checks 自动确认并增强保持；ALEKS Insights 实时提醒教师关注“不成功、停止成功、过度拖延、异常快”的学生。
- 第一手依据（原文引用）：
  - 官网：“questions chosen by ALEKS based on their responses to all previous questions”
  - 官网：“ALEKS facilitates super-effective learning by offering the student a selection of the topics that they are currently ready to learn”
  - 官网：“ALEKS Insights promptly alerts educators to at risk students ... who are not succeeding, who cease succeeding, who are excessively procrastinating, or who are learning unusually fast”
  - 来源：<https://www.aleks.com/about_aleks>

### 10. ClassPoint

- 官方链接：<https://www.classpoint.io/>；AI 生成功能页：<https://www.classpoint.io/ai-quiz-generator>
- 类型：商业产品案例（ClassPoint 官方产品页）
- 做什么：PowerPoint 内的实时课堂互动工具（互动测验、词云、实时 Q&A、游戏化等），并有 ClassPoint AI 从幻灯片内容即时生成题目。
- 如何做到主动互动：官网原文“ClassPoint AI will read your slides and generate different type of quiz questions on the go”，即基于课堂内容即时出题；支持实时测验与 Live Q&A，教师可见“which students are struggling and need additional support as we go”；学生端也能获得实时反馈。
- 第一手依据（原文引用）：
  - 官网：“Real-time interactive quizzes for every occasion”
  - 官网：“ClassPoint AI will read your slides and generate different type of quiz questions on the go”
  - 官网：“I can see which students are struggling and need additional support as we go so I can assist easier”（教师案例原文）
  - 来源：<https://www.classpoint.io/>、<https://www.classpoint.io/ai-quiz-generator>

## “主动互动”实现模式总结

1. 知识状态模型驱动的自动出题/选题：OATutor 的 BKT、ALEKS 的知识空间、MATHia 的技能级自适应、Civil AI 的掌握度投影，都是先建立“学生目前会什么、下一步该练什么”的模型，再由系统主动决定下一题或下一主题，而不是等学生提问。
2. 答错/卡住后的自动介入：OATutor 答错强制进入提示路径、MATHia 的 just-in-time hints、ALEKS Insights 对异常学生的实时提醒、MATHia LiveLab 的实时 alert，共同点是“检测到问题立即介入”。
3. 对话式苏格拉底引导：Khanmigo 不给直接答案而是引导思考，Tutor CoPilot 引导真人老师问引导性问题，ClassroomLM 在复习群聊中连续出题逐题评价，都属于“用提问替代灌输”。
4. 基于课堂内容的 grounded 互动：ClassroomLM 按课堂隔离 RAG 知识库，ClassPoint AI 从当前 PPT 幻灯片生成题目，Khanmigo 绑定 Khan Academy 内容库，保证互动内容来自课堂材料而不是泛化知识。
5. 多 agent 主动规划：GenMentor 把“识别技能缺口 → 建模学习者 → 调度学习路径 → 生成内容/评估 → 对话辅导”拆成多个 agent 协同，主动规划与评估；Civil AI 的 daily plan + spaced review 是轻量版同类设计。

## 对我们学生端的借鉴点（单用户、本地、文件为状态、AI 基于 lesson/reference 内容回答）

- 把 lesson/reference 显式结构化为知识单元（参考 OATutor 的 `skillModel.json` 与 `coursePlans.json`），让 AI 的“掌握度”建立在可落盘的文件状态上，而不是只依赖聊天历史。
- 采用“证据先行、确定性状态管数据、AI 管教学决策”的分层（Civil AI 的 evidence before autonomy）：用本地文件记录作答证据、掌握度、错题、复习优先级，AI 根据这些状态主动决定追问、复习或换题。
- 在答错/答对事件上触发主动动作：答错自动进入 hint → scaffold → 再问的递进路径（OATutor），或给 just-in-time 提示（MATHia）；答对后可立即出同知识点变式题。
- 把“复习提醒/定时互动”做成可持久化的计划文件：参考 Civil AI 的 review priority 与 spaced review、ALEKS 的 Knowledge Checks，让 AI 在本地状态上安排下次复习，而不是临时想起来才提醒。
- 内容 grounded：问答与出题都限制在 lesson/reference 文件内（ClassroomLM 的隔离知识库、ClassPoint AI 的幻灯片出题是同一思路），并显式引用来源文件，避免 AI 引入课外内容。
- 本地优先与 provider-neutral：Civil AI 的 SQLite/IndexedDB + 可替换模型网关，与“单用户本地、文件为状态”最接近，可直接参考其模块边界和迁移设计。

## 资料来源列表

- OATutor README：<https://github.com/CAHLR/OATutor#readme>
- ClassroomLM README：<https://github.com/TechAtNYU/ClassroomLM#readme>
- GenMentor README：<https://github.com/GeminiLight/gen-mentor#readme>；论文：<https://arxiv.org/abs/2501.15749>
- Civil AI README：<https://github.com/zhangl1001/civil-ai#readme>
- Tutor CoPilot 论文页：<https://arxiv.org/abs/2410.03017>；demo 代码：<https://github.com/rosewang2008/tutor-copilot#readme>
- Coding-Tutor README：<https://github.com/iwangjian/Coding-Tutor#readme>；论文：<https://arxiv.org/abs/2502.13311>
- Khanmigo 官方产品页：<https://www.khanmigo.ai/>
- MATHia 官方产品页：<https://www.carnegielearning.com/solutions/math/mathia>
- ALEKS 官方 About 页：<https://www.aleks.com/about_aleks>
- ClassPoint 官方首页：<https://www.classpoint.io/>；AI Quiz Generator：<https://www.classpoint.io/ai-quiz-generator>

> 方法说明：搜索候选时曾检查 AutoTutor 官网、OpenStax Tutor 等，因官网被反爬拦截（HTTP 403/000）或页面需 JS 渲染且无法取得稳定原文，未收录，宁缺毋滥。
