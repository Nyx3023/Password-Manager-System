const fs = require('node:fs');
const net = require('node:net');

const PIPE_NAME = '\\\\.\\pipe\\passwordmanager-ext-ipc';

function sendMessage(msgObj) {
  const msgStr = JSON.stringify(msgObj);
  const buf = Buffer.from(msgStr, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(buf.length, 0);
  process.stdout.write(header);
  process.stdout.write(buf);
}

const client = net.createConnection(PIPE_NAME);
client.on('error', (err) => {
  sendMessage({ error: "HOST_NOT_FOUND", details: err.message });
  process.exit(1);
});

let appBuffer = "";
client.on('data', (data) => {
  appBuffer += data.toString();
  const parts = appBuffer.split('\n');
  appBuffer = parts.pop(); // keep remainder
  for (const part of parts) {
    if (!part.trim()) continue;
    try {
      const respObj = JSON.parse(part);
      sendMessage(respObj);
    } catch(e) {}
  }
});

let inputBuffer = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  
  while (inputBuffer.length >= 4) {
    const payloadSize = inputBuffer.readUInt32LE(0);
    if (inputBuffer.length >= 4 + payloadSize) {
      const content = inputBuffer.slice(4, 4 + payloadSize).toString('utf8');
      inputBuffer = inputBuffer.slice(4 + payloadSize);
      
      try {
        const message = JSON.parse(content);
        client.write(JSON.stringify(message) + "\n");
      } catch(e) {}
    } else {
      break; // need more data
    }
  }
});

process.stdin.on('end', () => {
  client.end();
  process.exit(0);
});
