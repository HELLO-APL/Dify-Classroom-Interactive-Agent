import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const configPath = path.join(os.homedir(), '.codex', 'config.toml');
const config = fs.readFileSync(configPath, 'utf8');
const tokenMatch = config.match(/\[mcp_servers\.n8n\][\s\S]*?Authorization = "([^"]+)"/);

if (!tokenMatch) {
  throw new Error('n8n MCP authorization token not found');
}

const [name, argsJson] = process.argv.slice(2);
const payload = {
  jsonrpc: '2.0',
  id: Date.now(),
};

if (name === 'tool-schema') {
  const { toolName } = JSON.parse(argsJson || '{}');
  const listResponse = await fetch('http://127.0.0.1:5678/mcp-server/http', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenMatch[1]}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now() + 1, method: 'tools/list', params: {} }),
  });
  const listText = await listResponse.text();
  const listLines = listText
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  const listEvent = JSON.parse(listLines[0]);
  const tool = listEvent.result.tools.find((entry) => entry.name === toolName);
  if (!tool) {
    console.error(`Tool not found: ${toolName}`);
    process.exit(1);
  }
  console.log(JSON.stringify({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }, null, 2));
  process.exit(0);
}

if (name.startsWith('raw:')) {
  payload.method = name.slice(4);
  payload.params = JSON.parse(argsJson || '{}');
} else {
  payload.method = 'tools/call';
  let parsedArgs;
  if (argsJson?.startsWith('@code:')) {
    parsedArgs = { code: fs.readFileSync(argsJson.slice(6), 'utf8') };
  } else if (argsJson?.startsWith('@')) {
    parsedArgs = JSON.parse(fs.readFileSync(argsJson.slice(1), 'utf8'));
  } else {
    parsedArgs = JSON.parse(argsJson || '{}');
  }
  if (parsedArgs.code && parsedArgs.code.startsWith('@code:')) {
    parsedArgs.code = fs.readFileSync(parsedArgs.code.slice(6), 'utf8');
  }
  payload.params = { name, arguments: parsedArgs };
}

const response = await fetch('http://127.0.0.1:5678/mcp-server/http', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${tokenMatch[1]}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  },
  body: JSON.stringify(payload),
});

const text = await response.text();
if (!response.ok) {
  console.error(text);
  process.exit(1);
}

const lines = text
  .split(/\r?\n/)
  .filter((line) => line.startsWith('data:'))
  .map((line) => line.slice(5).trim())
  .filter(Boolean);

for (const line of lines) {
  const event = JSON.parse(line);
  if (event.error) {
    console.error(JSON.stringify(event.error, null, 2));
    process.exit(1);
  }
  if (event.result) {
    const content = event.result.content;
    if (Array.isArray(content)) {
      for (const item of content) {
        if (item.type === 'text') console.log(item.text);
        else console.log(JSON.stringify(item, null, 2));
      }
    } else {
      console.log(JSON.stringify(event.result, null, 2));
    }
  }
}
