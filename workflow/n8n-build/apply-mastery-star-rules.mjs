import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const buildDir = fileURLToPath(new URL("./", import.meta.url));
const workflowFile = resolve(buildDir, "teach-workflow.mjs");
const updateFile = resolve(buildDir, "update-host-continue-rule.json");

const replacements = [
  [
    "class agent 下文件只读；",
    "class agent 下文件只读，0-5 星规则见 class agent/class-interaction/MASTERY-STAR-RULES.md；",
  ],
  [
    "- class agent 下全部 md 与 KNOWLEDGE-BASE.md：老师规则与稳定知识点目录，只读。",
    "- class agent 下全部 md 与 KNOWLEDGE-BASE.md：老师规则与稳定知识点目录，只读。\n- class agent/class-interaction/MASTERY-STAR-RULES.md：0-5 星掌握度唯一换算规则。",
  ],
  [
    `标记自动生成状态：
- 完全不懂 -> 未掌握
- 没有听到/走神 -> 未掌握
- 部分理解 -> 部分掌握
- 掌握 -> 掌握
- 自定义标签 -> 先只记录标记，不直接生成掌握状态；待 AI 答疑或后续检测评估后，再更新为掌握状态。

学生打标记只是自我报告，不等于 AI 已确认的掌握证据。掌握状态只能在有真实对话或检测证据后更新。`,
    `标注与掌握星级的关系：
- 没有标注、答题或考核记录的知识点为 0 星，前端不显示星星。
- 有效标注关联到 KP-xxx 后，知识点最低提升为 1 星。
- 完全不懂、没有听到、部分理解、掌握、自定义标签都继续作为原始标注保留。
- 多条标注不会重复加星；标注本身不能生成 5 星。
- 学生打“掌握”只是自我报告，不等于正式考核，也不直接生成 5 星。`,
  ],
  [
    `【掌握状态规则】
学生掌握状态只允许出现：
- 未检测：目录里有该知识点，但从未检测或从未接触。
- 掌握
- 部分掌握
- 未掌握

掌握状态数据不放在 DIALOGUE-LOG.md 中作为唯一来源，而应写入 student-workspace/data/mastery-state.json。
每次状态变化都必须在 mastery-history.json 追加一条历史：
- time
- knowledge_point_id
- old_status
- new_status
- source: class_point / dialogue / manual
- evidence

触发掌握状态更新的情况：
1. 学生答题后，AI 判断有真实掌握证据。
2. 上课标记自动映射。
3. 自定义标签经 AI 答疑评估后产生结论。
4. 学生在学生 workspace 手动修改标签或掌握状态。

学生端可以自定义标签。工作流只在有评估证据时把自定义标签换算成掌握状态。`,
    `【掌握状态规则】
掌握度使用 0-5 星，必须严格遵循 class agent/class-interaction/MASTERY-STAR-RULES.md：
- 0 星：未检测，不显示星星。
- 1 星：已标注。
- 2 星：初步理解。
- 3 星：理解中。
- 4 星：接近掌握。
- 5 星：已掌握，只能由通过正式考核产生。

掌握状态数据不放在 DIALOGUE-LOG.md 中作为唯一来源，而应写入 student-workspace/data/mastery-state.json。
每次状态变化都必须在 mastery-history.json 追加一条历史：
- time
- knowledge_point_id
- old_stars
- new_stars
- old_status
- new_status
- source: class_point / dialogue / assessment / manual
- evidence
- annotation_id（有对应标注时）

触发掌握状态更新的情况：
1. 新增或更新有效标注，并关联到 KP-xxx。
2. 学生答题后，AI 判断有真实掌握证据。
3. 自定义标签经 AI 答疑评估后产生结论。
4. 正式考核通过，满足知识点掌握表现。
5. 学生在学生 workspace 手动修改标签或掌握状态。

学生端可以自定义标签。工作流只在有标注关联或评估证据时更新星级；没有新证据时保留原星级。`,
  ],
  [
    "- mastery_updates 是数组，元素包含 knowledge_point_id、old_status、new_status、source、evidence、time。",
    "- mastery_updates 是数组，元素包含 knowledge_point_id、old_stars、new_stars、old_status、new_status、source、evidence、annotation_id、time。",
  ],
];

function replaceAll(contents, pairs) {
  let next = contents;
  for (const [from, to] of pairs) {
    next = next.split(from).join(to);
  }
  return next;
}

function replaceInJson(value, pairs) {
  if (typeof value === "string") return replaceAll(value, pairs);
  if (Array.isArray(value)) return value.map((item) => replaceInJson(item, pairs));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceInJson(item, pairs)]),
    );
  }
  return value;
}

const escapedPairs = replacements.map(([from, to]) => [
  JSON.stringify(from).slice(1, -1),
  JSON.stringify(to).slice(1, -1),
]);

const workflowContents = await readFile(workflowFile, "utf8");
await writeFile(workflowFile, replaceAll(workflowContents, escapedPairs), "utf8");

const updateContents = JSON.parse(await readFile(updateFile, "utf8"));
const updatedJson = replaceInJson(updateContents, replacements);
await writeFile(updateFile, `${JSON.stringify(updatedJson, null, 2)}\n`, "utf8");

console.log("Applied mastery star rules to n8n workflow sources.");
