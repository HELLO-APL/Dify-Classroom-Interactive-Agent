import { workflow, trigger, node, expr } from '@n8n/workflow-sdk';

const manual = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'File IO Test Start' },
  output: [{}],
});

const readRule = node({
  type: 'n8n-nodes-base.readWriteFile',
  version: 1.1,
  config: {
    name: 'Read Rule File',
    parameters: {
      operation: 'read',
      fileSelector: '/data/class-teach/class agent/dialogue/SKILL.md',
    },
  },
  output: [{ fileName: 'SKILL.md' }],
});

const extractText = node({
  type: 'n8n-nodes-base.extractFromFile',
  version: 1.1,
  config: {
    name: 'Extract Rule Text',
    parameters: {
      operation: 'text',
      destinationKey: 'text',
      options: { encoding: 'utf8', keepSource: 'json' },
    },
  },
  output: [{ fileName: 'SKILL.md', text: 'Dialogue skill text' }],
});

const makeWritePayload = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Create Write Payload',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const items = $input.all(); const source = items[0]?.json || {}; return [{ json: { targetFileName: '/data/class-teach/teach test/__n8n_write_test.txt', fileContent: 'READ_OK ' + (source.fileName || '') + ' ' + (source.text || '').length }, pairedItem: { item: 0 } }];",
    },
  },
  output: [{ targetFileName: '/data/class-teach/teach test/__n8n_write_test.txt', fileContent: 'READ_OK' }],
});

const jsonToBinary = node({
  type: 'n8n-nodes-base.moveBinaryData',
  version: 1.1,
  config: {
    name: 'Markdown Text to Binary',
    parameters: {
      mode: 'jsonToBinary',
      convertAllData: false,
      sourceKey: 'fileContent',
      destinationKey: 'data',
      options: {
        encoding: 'utf8',
        fileName: expr('{{ $json.targetFileName }}'),
        keepSource: true,
        mimeType: 'text/plain',
        useRawData: true,
      },
    },
  },
  output: [{ targetFileName: '/data/class-teach/teach test/__n8n_write_test.txt' }],
});

const writeFile = node({
  type: 'n8n-nodes-base.readWriteFile',
  version: 1.1,
  config: {
    name: 'Write Test File',
    parameters: {
      operation: 'write',
      fileName: expr('{{ $json.targetFileName }}'),
      dataPropertyName: 'data',
    },
  },
  output: [{ fileName: '/data/class-teach/teach test/__n8n_write_test.txt' }],
});

export default workflow('file-io-write-test', 'File IO Write Test')
  .add(manual)
  .to(readRule)
  .to(extractText)
  .to(makeWritePayload)
  .to(jsonToBinary)
  .to(writeFile);
