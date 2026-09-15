import {
  workflow,
  node,
  trigger,
  ifElse,
  merge,
  languageModel,
  memory,
  newCredential,
  expr,
} from '@n8n/workflow-sdk';

const chatTrigger = trigger({
  type: '@n8n/n8n-nodes-langchain.chatTrigger',
  version: 1.4,
  config: {
    name: 'Chat Trigger',
    parameters: {
      public: true,
      mode: 'hostedChat',
      options: {
        allowFileUploads: true,
        responseMode: 'lastNode',
        inputPlaceholder: '输入本轮消息，或使用 ???、/结束、/research、/帮助',
        title: 'teach 课堂互动',
        subtitle: '每轮会读取规则与状态文件',
      },
    },
  },
  output: [
    {
      chatInput: '本轮学生消息',
      sessionId: '聊天会话标识',
      files: [{ fileName: 'upload.md', name: 'upload.md' }],
    },
  ],
});

const normalizeInput = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Normalize Input',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      assignments: {
        assignments: [
          {
            id: 'student-message',
            name: 'studentMessage',
            value: expr('{{ $json.chatInput ?? "" }}'),
            type: 'string',
          },
          {
            id: 'student-id',
            name: 'studentId',
            value: 'student-001',
            type: 'string',
          },
          {
            id: 'file-count',
            name: 'fileCount',
            value: expr('{{ $json.files ? $json.files.length : 0 }}'),
            type: 'number',
          },
          {
            id: 'uploaded-file-name',
            name: 'uploadedFileName',
            value: expr(
              '{{ ($json.files && $json.files[0]) ? ($json.files[0].fileName || $json.files[0].name || "") : "" }}',
            ),
            type: 'string',
          },
          {
            id: 'teacher-material',
            name: 'teacherMaterial',
            value: '',
            type: 'string',
          },
          {
            id: 'context-role',
            name: 'role',
            value: 'chat',
            type: 'string',
          },
        ],
      },
      options: {
        includeBinary: true,
        stripBinary: false,
        ignoreConversionErrors: true,
      },
    },
  },
  output: [
    {
      chatInput: '本轮学生消息',
      files: [{ fileName: 'upload.md', name: 'upload.md' }],
      studentMessage: '本轮学生消息',
      studentId: 'student-001',
      fileCount: 0,
      uploadedFileName: '',
      teacherMaterial: '',
      role: 'chat',
    },
  ],
});

const checkUploadedFile = ifElse({
  version: 2.3,
  config: {
    name: 'Check Uploaded File',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [
          {
            leftValue: expr('{{ $json.fileCount }}'),
            operator: { type: 'number', operation: 'gt' },
            rightValue: 0,
          },
        ],
        combinator: 'and',
      },
    },
  },
});

const extractUploadedText = node({
  type: 'n8n-nodes-base.extractFromFile',
  version: 1.1,
  config: {
    name: 'Extract Uploaded Text',
    parameters: {
      operation: 'text',
      binaryPropertyName: 'data0',
      destinationKey: 'text',
      options: { encoding: 'utf8', keepSource: 'json' },
    },
  },
  output: [{ fileName: 'uploaded.md', text: '上传文件正文' }],
});

const attachUploadContext = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Attach Upload Context',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      assignments: {
        assignments: [
          {
            id: 'uploaded-text',
            name: 'uploadedText',
            value: expr('{{ $json.text || "" }}'),
            type: 'string',
          },
          {
            id: 'upload-student-message',
            name: 'studentMessage',
            value: nodeJson(normalizeInput, 'studentMessage'),
            type: 'string',
          },
          {
            id: 'upload-student-id',
            name: 'studentId',
            value: nodeJson(normalizeInput, 'studentId'),
            type: 'string',
          },
          {
            id: 'upload-file-count',
            name: 'fileCount',
            value: nodeJson(normalizeInput, 'fileCount'),
            type: 'number',
          },
          {
            id: 'upload-file-name',
            name: 'uploadedFileName',
            value: nodeJson(normalizeInput, 'uploadedFileName'),
            type: 'string',
          },
          {
            id: 'upload-teacher-material',
            name: 'teacherMaterial',
            value: nodeJson(normalizeInput, 'teacherMaterial'),
            type: 'string',
          },
          {
            id: 'upload-context-role',
            name: 'role',
            value: 'chat',
            type: 'string',
          },
        ],
      },
    },
  },
  output: [{ uploadedText: '上传文件正文', studentMessage: '本轮学生消息' }],
});

const readRuleFiles = node({
  type: 'n8n-nodes-base.readWriteFile',
  version: 1.1,
  config: {
    name: 'Read Rule Files',
    parameters: {
      operation: 'read',
      fileSelector: '/data/class-teach/class agent/**/*.md',
    },
  },
  output: [{ fileName: 'SKILL.md' }],
});

const extractRuleFiles = node({
  type: 'n8n-nodes-base.extractFromFile',
  version: 1.1,
  config: {
    name: 'Extract Rule Files',
    parameters: {
      operation: 'text',
      binaryPropertyName: 'data',
      destinationKey: 'text',
      options: { encoding: 'utf8', keepSource: 'json' },
    },
  },
  output: [{ fileName: 'SKILL.md', text: '规则文件文本' }],
});

const readStateFiles = node({
  type: 'n8n-nodes-base.readWriteFile',
  version: 1.1,
  config: {
    name: 'Read State Files',
    parameters: {
      operation: 'read',
      fileSelector: '/data/class-teach/teach test/*.md',
    },
  },
  output: [{ fileName: 'TMISSION.md' }],
});

const extractStateFiles = node({
  type: 'n8n-nodes-base.extractFromFile',
  version: 1.1,
  config: {
    name: 'Extract State Files',
    parameters: {
      operation: 'text',
      binaryPropertyName: 'data',
      destinationKey: 'text',
      options: { encoding: 'utf8', keepSource: 'json' },
    },
  },
  output: [{ fileName: 'TMISSION.md', text: '状态文件文本' }],
});


const readClassPointFiles = node({
  type: 'n8n-nodes-base.readWriteFile',
  version: 1.1,
  config: {
    name: 'Read Class Point Files',
    parameters: {
      operation: 'read',
      fileSelector: '/data/class-teach/class-point/**/*.json',
    },
  },
  output: [{ fileName: 'point.json' }],
});

const extractClassPointFiles = node({
  type: 'n8n-nodes-base.extractFromFile',
  version: 1.1,
  config: {
    name: 'Extract Class Point Files',
    parameters: {
      operation: 'text',
      binaryPropertyName: 'data',
      destinationKey: 'text',
      options: { encoding: 'utf8', keepSource: 'json' },
    },
  },
  output: [{ fileName: 'point.json', text: 'class-point 内容' }],
});

const combineSources = merge({
  version: 3.2,
  config: {
    name: 'Combine Sources',
    parameters: { mode: 'append', numberInputs: 5 },
  },
});

const combineContext = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Combine Context',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const item = $input.first().json;
const raw = (item.output && typeof item.output === 'object') ? item.output : item;
const reply = typeof raw.reply === 'string' ? raw.reply : '';
const updates = [
  ['tmission_md', '/data/class-teach/teach test/TMISSION.md'],
  ['smission_md', '/data/class-teach/teach test/SMISSION.md'],
  ['notes_md', '/data/class-teach/teach test/NOTES.md'],
  ['lesson_interaction_md', '/data/class-teach/teach test/LESSON-INTERACTION.md'],
  ['glossary_md', '/data/class-teach/teach test/GLOSSARY.md'],
  ['learning_record_md', '/data/class-teach/teach test/LEARNING-RECORD.md'],
  ['dialogue_log_md', '/data/class-teach/teach test/DIALOGUE-LOG.md'],
];
const rows = [];
for (const entry of updates) {
  const fieldName = entry[0];
  const filePath = entry[1];
  const content = raw[fieldName];
  if (typeof content === 'string' && content.trim().length > 0) {
    rows.push({ json: { targetFile: filePath, fileContent: content, reply: reply }, pairedItem: { item: 0 } });
  }
}
const classPointFiles = Array.isArray(raw.class_point_files) ? raw.class_point_files : [];
for (const pointFile of classPointFiles) {
  const nameRaw = String(pointFile.fileName || pointFile.name || '');
  const slashIndex = Math.max(nameRaw.lastIndexOf('\\'), nameRaw.lastIndexOf('/'));
  const fileName = slashIndex >= 0 ? nameRaw.slice(slashIndex + 1) : nameRaw;
  const content = String(pointFile.fileContent || pointFile.content || '');
  if (fileName && content.trim().length > 0) {
    rows.push({ json: { targetFile: '/data/class-teach/class-point/points/' + fileName, fileContent: content, reply: reply }, pairedItem: { item: 0 } });
  }
}
if (rows.length === 0) {
  rows.push({ json: { targetFile: '/data/class-teach/teach test/DIALOGUE-LOG.md', fileContent: '# DIALOGUE-LOG\n\n## 回退记录\n- 模型未返回可写入的状态更新\n- 本轮回复: ' + reply, reply: reply }, pairedItem: { item: 0 } });
}
return rows;`,
    },
  },
  output: [
    {
      rulesText: '规则文本',
      stateText: '状态文本',
      studentMessage: '本轮学生消息',
      studentId: 'student-001',
      uploadedText: '',
      uploadedFileName: '',
      teacherMaterial: '',
      fileCount: 0,
    },
  ],
});

const deepSeekModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatDeepSeek',
  version: 1,
  config: {
    name: 'DeepSeek Chat Model',
    parameters: {
      model: 'deepseek-chat',
      options: {
        responseFormat: 'json_object',
        temperature: 0.4,
      },
    },
    credentials: { deepSeekApi: newCredential('DeepSeek account') },
  },
});

const teachMemory = memory({
  type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
  version: 1.4,
  config: {
    name: 'Teach Chat Memory',
    parameters: {
      sessionIdType: 'customKey',
      sessionKey: expr("{{ $('Chat Trigger').item.json.sessionId }}"),
      contextWindowLength: 20,
    },
  },
});

const teachAgent = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'Teach Session Agent',
    parameters: {
      promptType: 'define',
      text: expr("=【学生消息】\n{{ $json.studentMessage }}\n\n【上传文件】\n文件数: {{ $json.fileCount }}\n文件名: {{ $json.uploadedFileName }}\n文件正文:\n{{ $json.uploadedText }}\n\n【老师端接口/网站材料】\n{{ $json.teacherMaterial }}\n\n【状态文件】\n{{ $json.stateText }}\n\n【规则、格式与 class-point 数据】\n{{ $json.rulesText }}\n\n【输出格式】只输出一个合法 JSON 对象，不要 markdown 代码块，不要额外文字，不要调用工具。字段必须是 reply、tmission_md、smission_md、notes_md、lesson_interaction_md、glossary_md、learning_record_md、dialogue_log_md、class_point_files。dialogue_log_md 必须非空且包含完整更新后的 DIALOGUE-LOG.md。只要课堂播放中需要记录学生问题，或答疑后需要更新标记点状态，class_point_files 就必须包含对应文件；不允许只把标记点内容写进 dialogue_log_md 而不落成 point 文件。"),
      hasOutputParser: false,
      options: {
        systemMessage: "你是本机 n8n 中运行的单学生课堂互动智能体 teach。第一版固定 student_id=student-001，但状态文件保留 student_id。class agent 下文件只读，0-5 星规则见 class agent/class-interaction/MASTERY-STAR-RULES.md；teach test 下七个状态 md 可读写；class-point/segments 为样例只读；class-point/points 可由接口或 AI 写入。当前 class-point 里的 source_link、标签、知识点片段都是本地样例，正式环境以后由外部接口提供，不要把样例当成接口结论。\n【消息类型判断】每轮先判断输入属于哪一种：主持人/课堂事件、学生上课中直接提问、学生对标记点的选择、学生答疑回答、状态/文件上传、普通课堂消息。主持人事件本版用手动测试命令触发：/上课开始、/开始播放 <segment_id>、/段落结束 <segment_id>、/下课；未来由平台接口传 event_type。\n【课堂状态】在 DIALOGUE-LOG 中维护 speaker（host 或 student）、host_phase（uninitialized、intro、lecturing、segment_summary、point_review、ending）和 active_segment_id。模型必须在每轮 dialogue_log_md 中保留并更新这些字段。若 DIALOGUE-LOG 尚无 host_phase，则视为 uninitialized；只有收到 /上课开始 后才进入 intro。\n【主持人事件规则】收到 /上课开始：以主持人身份介绍本课主题、安排和节奏，不提问，不进入学生答题。收到 /开始播放 seg-xxx：以主持人身份宣布开始播放该片段，host_phase=lecturing，active_segment_id=seg-xxx，本轮不提问。收到 /段落结束 seg-xxx：先按 seg-xxx 的知识点内容做简短总结；再从 class-point points 中列出该 segment 且 status 为 open 的标记点，展示 point_id、mark_level、reason_tags、student_note、source_link，并请学生选择编号。收到 /下课：以主持人身份总结整节课，然后执行收尾规则。\n【继续事件】\n学生输入“继续”时，先判断 host_phase。\n- 仅当 host_phase=point_review 时，“继续”表示结束当前标记点答疑。\n- 若本轮答疑已有真实掌握证据，当前标记点 status=已解决。\n- 若没有掌握证据，当前标记点 status=延后；“继续”本身不能作为掌握证据。\n- 必须写入 current_question: 无、host_flow: next_step_requested、speaker: host，并结束 point_review。\n- reply 必须固定为：“当前标记点已处理结束，准备进入下一段。”\n- 不得列出其他 open 标记点，不得让学生选择另一个标记点，不得提问，不得提醒学生打标记，不得自由发挥。\n- host_phase=segment_summary 且没有开放标记点时，学生“继续”不触发主持人流程，只记录为普通消息，等待主持人手动输入下一步。\n- host_phase=lecturing 时，学生“继续”按普通课堂消息处理，不推进当前片段。\n- 主持人开始下一段后，将 host_flow 重置为 none。\n【上课中直接提问】当 host_phase=lecturing 且学生发来问题时，不讲解、不评价、不追问、不启动原教学规则；回复不超过一句已记下，等这一段讲完一起处理，并通过 class_point_files 写入一条记录。记录默认 mark_level=没掌握，reason_tags 含 课堂提问，type=question，segment_id=active_segment_id，status=open，content=学生问题，source_link 若样例有原值则保留，否则填待接口提供。\n【学生选择标记点】当 host_phase=segment_summary 且学生选择某个 point_id 时，进入 point_review，并从 class-point segments 中读取对应知识点片段。标签只是学生自我判断，不等于掌握证据。处理方式：mark_level=掌握 只做轻确认，不直接写 mastered；mark_level=没掌握 且 reason_tags 含 完全不懂，从基础讲；含 没有听到，快速重讲核心；含 部分理解，先追问缺口。答疑结束后通过 class_point_files 更新该 point 的 status 为已解决或延后。\n【point_review 对话规则】只有 host_phase=point_review 时，才使用原来的学生答题规则：从 TMISSION 找难点，从 LESSON-INTERACTION 找易混淆点，只有能连接本课时才用 SMISSION 兴趣钩子。答对简短确认并推进；部分答对先肯定再追更小缺口；答错先提示不直接讲答案；同一题两次没答对换策略或降难度；每次只问一个问题，下一问来自更新后的 session control。\n【命令】??? 不引入新材料，把上一步拆小重讲再做简短检查；/research 本版无外部工具，回复占位说明并提示答案要标注来源；/帮助 只显示六项菜单：1 给提示但不讲完整答案，2 换例子，3 换说法重讲，4 讲慢一点拆小步骤，5 先换更简单的题，6 今天先到这里。学生选择后只执行所选帮助。\n【Glossary】GLOSSARY.md 是 AI 精确表达参考，不是学生语言考试；学生用自己的话说清楚就接受。只有解释、比较或提问确实需要才引入 glossary 词。学生正确使用且有真实理解证据才记为 glossary candidate；/结束 只在有真实证据时新增或修订。\n【文件更新】输出必须是完整 markdown，保留未改动章节，只改有证据支持的部分。每轮 dialogue_log_md 必须非空，写入 current_target、current_question、attempts、mastered、unresolved、wait_what_used、research_used、help_used、inactivity_step、student_status、host_flow、speaker、host_phase、active_segment_id、本轮证据、下次重点。其他 *_md 需要改写才给完整内容，不需要就返回空字符串。\n【收尾】收到 /结束 后不再提问；汇总证据；更新 SMISSION 进度；更新 NOTES 工作观察；有真实证据才更新 GLOSSARY 与 LEARNING-RECORD；更新 DIALOGUE-LOG；phase 置 ended；reply 给学生简短更新摘要。host_phase=ending 且学生没有发 /结束 时，提示已结束并说明新一轮需重新准备。\n【上传处理】若 uploadedFileName 精确等于 TMISSION.md、SMISSION.md、NOTES.md、LESSON-INTERACTION.md、GLOSSARY.md、LEARNING-RECORD.md、DIALOGUE-LOG.md 之一且正文像完整 md，就把它写入对应 *_md 并只确认收到；其他文件或老师材料一律按备课处理，把正文写入 lesson_interaction_md 的老师端输入区并注明来源，本轮不进入学生提问。\n【class_point_files 格式】只有需要新增或更新标记点时返回该字段，格式为数组：[{fileName: point-001.json, fileContent: {完整 JSON 字符串}}]。fileName 只允许 points 下的 json 文件名，fileContent 必须是完整、合法、可单独读取的 JSON。fileContent 的 JSON 必须包含 point_id、student_id、lesson_id、segment_id、type、mark_level、reason_tags、student_note 或 content、source_link、status、created_at；不得省略 mark_level，也不得只写 tags。\n【输出要求】reply 是唯一给用户看的内容，其余字段是待写文件内容。输出 JSON 字段：reply、tmission_md、smission_md、notes_md、lesson_interaction_md、glossary_md、learning_record_md、dialogue_log_md、class_point_files。",
      },
    },
    subnodes: { model: deepSeekModel, memory: teachMemory },
  },
  output: [{ output: '{"reply":"给学生看的回复","dialogue_log_md":"# DIALOGUE-LOG"}' }],
});

const parseAgentJson = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Agent JSON',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const item = $input.first().json;
const text = typeof item.output === 'string' ? item.output : JSON.stringify(item.output || '');
let parsed = null;
try {
  parsed = JSON.parse(text);
} catch (error) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const candidate = text.slice(start, end + 1);
    try { parsed = JSON.parse(candidate); } catch (innerError) {}
  }
}
if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
  parsed = {
    reply: text || '本轮处理失败，请稍后重试。',
    dialogue_log_md: '# DIALOGUE-LOG\\n\\n## 回退记录\\n- 模型未输出可解析 JSON，已保留原样回复。',
  };
}
return [{ json: { output: parsed }, pairedItem: { item: 0 } }];`,
    },
  },
  output: [{ output: { reply: '给学生看的回复', dialogue_log_md: '# DIALOGUE-LOG' } }],
});

const prepareStateWrites = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Prepare State Writes',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const item = $input.first().json;
const raw = (item.output && typeof item.output === 'object') ? item.output : item;
const reply = typeof raw.reply === 'string' ? raw.reply : '';
const updates = [
  ['tmission_md', '/data/class-teach/teach test/TMISSION.md'],
  ['smission_md', '/data/class-teach/teach test/SMISSION.md'],
  ['notes_md', '/data/class-teach/teach test/NOTES.md'],
  ['lesson_interaction_md', '/data/class-teach/teach test/LESSON-INTERACTION.md'],
  ['glossary_md', '/data/class-teach/teach test/GLOSSARY.md'],
  ['learning_record_md', '/data/class-teach/teach test/LEARNING-RECORD.md'],
  ['dialogue_log_md', '/data/class-teach/teach test/DIALOGUE-LOG.md'],
];
const rows = [];
for (const entry of updates) {
  const fieldName = entry[0];
  const filePath = entry[1];
  const content = raw[fieldName];
  if (typeof content === 'string' && content.trim().length > 0) {
    rows.push({ json: { targetFile: filePath, fileContent: content, reply: reply }, pairedItem: { item: 0 } });
  }
}
if (rows.length === 0) {
  rows.push({ json: { targetFile: '/data/class-teach/teach test/DIALOGUE-LOG.md', fileContent: '# DIALOGUE-LOG\\n\\n## 回退记录\\n- 模型未返回可写入的状态更新\\n- 本轮回复: ' + reply, reply: reply }, pairedItem: { item: 0 } });
}
return rows;`,
    },
  },
  output: [{ targetFile: '/data/class-teach/teach test/DIALOGUE-LOG.md', fileContent: '# DIALOGUE-LOG' }],
});

const stateMarkdownToBinary = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'State Markdown to Binary',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const inputItems = $input.all();
const outputItems = [];
for (let index = 0; index < inputItems.length; index++) {
  const item = inputItems[index];
  const targetFile = String(item.json.targetFile || '');
  const fileContent = String(item.json.fileContent || '');
  if (!targetFile || !fileContent) continue;
  const fileName = targetFile.split('/').pop() || 'state.txt';
  const binaryData = await this.helpers.prepareBinaryData(
    Buffer.from(fileContent, 'utf8'),
    fileName,
    'text/plain',
  );
  outputItems.push({
    json: { targetFile, fileContent },
    binary: { data: binaryData },
    pairedItem: { item: index },
  });
}
return outputItems;`,
    },
  },
  output: [{ targetFile: '/data/class-teach/teach test/DIALOGUE-LOG.md' }],
});

const writeStateFiles = node({
  type: 'n8n-nodes-base.readWriteFile',
  version: 1.1,
  config: {
    name: 'Write State Files',
    parameters: {
      operation: 'write',
      fileName: expr('{{ $json.targetFile }}'),
      dataPropertyName: 'data',
    },
  },
  output: [{ fileName: '/data/class-teach/teach test/DIALOGUE-LOG.md' }],
});

const formatChatReply = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  executeOnce: true,
  config: {
    name: 'Format Chat Reply',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          {
            id: 'chat-output',
            name: 'output',
            value: expr(
              '{{ JSON.stringify({ text: (($("Parse Agent JSON").item.json.output && $("Parse Agent JSON").item.json.output.reply) ? $("Parse Agent JSON").item.json.output.reply : "本轮已处理"), speechKind: (($("Normalize Input").item.json.studentMessage || "").match(/^\\/(上课开始|开始播放|段落结束|下课)/) || String($("Parse Agent JSON").item.json.output.dialogue_log_md || "").match(/^- speaker:\\s*host\\s*$/m)) ? "teacher_guidance" : "answer" }) }}',
            ),
            type: 'string',
          },
          {
            id: 'speech-kind',
            name: 'speechKind',
            value: expr(
              '{{ ($("Normalize Input").item.json.studentMessage || "").match(/^\\/(上课开始|开始播放|段落结束|下课)/) || String($("Parse Agent JSON").item.json.output.dialogue_log_md || "").match(/^- speaker:\\s*host\\s*$/m) ? "teacher_guidance" : "answer" }}',
            ),
            type: 'string',
          },
        ],
      },
    },
  },
  output: [{ output: '给学生看的回复', speechKind: 'teacher_guidance' }],
});

export default workflow('teach', 'teach')
  .add(chatTrigger)
  .to(normalizeInput)
  .to(
    checkUploadedFile
      .onTrue(extractUploadedText.to(attachUploadContext.to(combineSources.input(1))))
      .onFalse(combineSources.input(0)),
  )
  .add(chatTrigger)
  .to(readRuleFiles.to(extractRuleFiles.to(combineSources.input(2))))
  .add(chatTrigger)
  .to(readStateFiles.to(extractStateFiles.to(combineSources.input(3))))
  .add(chatTrigger)
  .to(readClassPointFiles.to(extractClassPointFiles.to(combineSources.input(4))))
  .add(combineSources)
  .to(combineContext)
  .to(teachAgent)
  .to(parseAgentJson)
  .to(prepareStateWrites)
  .to(stateMarkdownToBinary)
  .to(writeStateFiles)
  .to(formatChatReply);
