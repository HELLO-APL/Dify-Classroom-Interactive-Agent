import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workflowId = "jB1zQp2zlHb3Fwk6";
const scriptDir = fileURLToPath(new URL("./", import.meta.url));
const helperPath = resolve(scriptDir, "mcp_call.mjs");
const updatePath = resolve(scriptDir, "update-host-continue-rule.json");
const sourcePath = resolve(scriptDir, "teach-workflow.mjs");

function callMcp(toolName, args) {
  const output = execFileSync(
    process.execPath,
    [helperPath, toolName, JSON.stringify(args)],
    { cwd: resolve(scriptDir, "../.."), encoding: "utf8" },
  );
  return JSON.parse(output);
}

const details = callMcp("get_workflow_details", {
  workflowId,
  detailLevel: "full",
});
const agentNode = details.workflow.nodes.find((node) => node.name === "Teach Session Agent");

if (!agentNode) {
  throw new Error("Teach Session Agent node not found");
}

let systemMessage = String(agentNode.parameters?.options?.systemMessage || "");
if (!systemMessage) {
  throw new Error("Teach Session Agent systemMessage is empty");
}

const continueRule = [
  "【继续事件】",
  "学生输入“继续”时，先判断 host_phase。",
  "- 仅当 host_phase=point_review 时，“继续”表示结束当前标记点答疑。",
  "- 若本轮答疑已有真实掌握证据，当前标记点 status=已解决。",
  "- 若没有掌握证据，当前标记点 status=延后；“继续”本身不能作为掌握证据。",
  "- 必须写入 current_question: 无、host_flow: next_step_requested、speaker: host，并结束 point_review。",
  "- reply 必须固定为：“当前标记点已处理结束，准备进入下一段。”",
  "- 不得列出其他 open 标记点，不得让学生选择另一个标记点，不得提问，不得提醒学生打标记，不得自由发挥。",
  "- host_phase=segment_summary 且没有开放标记点时，学生“继续”不触发主持人流程，只记录为普通消息，等待主持人手动输入下一步。",
  "- host_phase=lecturing 时，学生“继续”按普通课堂消息处理，不推进当前片段。",
  "- 主持人开始下一段后，将 host_flow 重置为 none。",
].join("\n");

const continueStart = systemMessage.indexOf("【继续事件】");
const continueEnd = systemMessage.indexOf("【上课中直接提问规则】", continueStart);
if (continueStart >= 0 && continueEnd > continueStart) {
  systemMessage =
    systemMessage.slice(0, continueStart) +
    `${continueRule}\n\n` +
    systemMessage.slice(continueEnd);
} else {
  const anchor = "\n\n【上课中直接提问规则】";
  if (!systemMessage.includes(anchor)) {
    throw new Error("Prompt insertion anchor not found");
  }
  systemMessage = systemMessage.replace(anchor, `\n\n${continueRule}${anchor}`);
}

if (!systemMessage.includes("- host_flow: none / next_step_requested")) {
  const stateAnchor = "- session_status\n";
  if (!systemMessage.includes(stateAnchor)) {
    throw new Error("State field insertion anchor not found");
  }
  systemMessage = systemMessage.replace(
    stateAnchor,
    `${stateAnchor}- host_flow: none / next_step_requested\n`,
  );
}

let sourceText = readFileSync(sourcePath, "utf8");
const escapedContinueRule = continueRule.replace(/\n/g, "\\n");
const sourceContinueStart = sourceText.indexOf("\\n【继续事件】");
const sourceContinueEnd = sourceText.indexOf("\\n【上课中直接提问", sourceContinueStart);
if (sourceContinueStart >= 0 && sourceContinueEnd > sourceContinueStart) {
  sourceText =
    sourceText.slice(0, sourceContinueStart + 2) +
    `${escapedContinueRule}` +
    sourceText.slice(sourceContinueEnd);
} else {
  const sourceAnchor = "\\n【上课中直接提问】";
  if (!sourceText.includes(sourceAnchor)) {
    throw new Error("Source prompt insertion anchor not found");
  }
  sourceText = sourceText.replace(
    sourceAnchor,
    `\\n${escapedContinueRule}${sourceAnchor}`,
  );
}
if (!sourceText.includes("student_status、host_flow、speaker、host_phase、active_segment_id")) {
  const sourceStateAnchor = "student_status、speaker、host_phase、active_segment_id";
  if (!sourceText.includes(sourceStateAnchor)) {
    throw new Error("Source state field insertion anchor not found");
  }
  sourceText = sourceText.replace(
    sourceStateAnchor,
    "student_status、host_flow、speaker、host_phase、active_segment_id",
  );
}
writeFileSync(sourcePath, sourceText, "utf8");

const update = {
  workflowId,
  versionName: "Add continue event state transition",
  versionDescription:
    "Define student continue handling during point review, including evidence-based point resolution, deferred fallback, and next host flow.",
  operations: [
    {
      type: "updateNodeParameters",
      nodeName: "Teach Session Agent",
      replace: true,
      parameters: {
        ...agentNode.parameters,
        options: {
          ...agentNode.parameters.options,
          systemMessage,
        },
      },
    },
  ],
};

writeFileSync(updatePath, `${JSON.stringify(update, null, 2)}\n`, "utf8");
console.log(updatePath);
