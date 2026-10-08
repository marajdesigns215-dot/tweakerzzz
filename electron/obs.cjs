'use strict';
const WebSocket = require('ws');
const { createHash, randomUUID } = require('node:crypto');
const sha = value => createHash('sha256').update(value).digest('base64');

// OBS v5, loopback only, read-only RPC allowlist. Passwords stay in memory and
// are never written to logs, recording metadata, browser storage, or exports.
function createObsClient({ Socket = WebSocket } = {}) {
  let socket, ready = false, connecting = false;
  const pending = new Map();
  function disconnect() {
    ready = false; connecting = false;
    const old = socket; socket = null; old?.terminate();
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('OBS connection closed.')); }
    pending.clear();
  }
  async function connect(input) {
    if (connecting) throw new Error('An OBS connection attempt is already running.');
    if (!input || !Number.isInteger(input.port) || input.port < 1024 || input.port > 65535 || typeof input.password !== 'string' || input.password.length > 256) throw new Error('Enter the OBS WebSocket port (1024–65535) and password.');
    disconnect(); connecting = true;
    const peer = new Socket('ws://127.0.0.1:' + input.port, { maxPayload: 256 * 1024, handshakeTimeout: 5000 }); socket = peer;
    return new Promise((resolve, reject) => {
      let password = input.password, settled = false;
      const finish = error => { if (settled) return; settled = true; clearTimeout(timeout); password = ''; if (socket !== peer) { reject(new Error('OBS connection was canceled.')); return; } connecting = false; if (error) { disconnect(); reject(error); } else { ready = true; resolve({ connected: true }); } };
      const timeout = setTimeout(() => finish(new Error('OBS did not complete its connection handshake. Enable the WebSocket server in OBS → Tools.')), 6000);
      peer.on('message', raw => {
        if (socket !== peer) return;
        try {
          const message = JSON.parse(raw.toString());
          if (message.op === 0 && !settled) {
            const auth = message.d?.authentication;
            if (auth && (typeof auth.salt !== 'string' || typeof auth.challenge !== 'string')) throw new Error('Invalid handshake');
            const identification = { rpcVersion: 1, eventSubscriptions: 0 };
            if (auth) identification.authentication = sha(sha(password + auth.salt) + auth.challenge);
            password = '';
            peer.send(JSON.stringify({ op: 1, d: identification }));
          } else if (message.op === 2) finish();
          else if (message.op === 7) {
            const request = pending.get(message.d?.requestId);
            if (!request) return; pending.delete(message.d.requestId); clearTimeout(request.timer);
            if (message.d.requestStatus?.result) request.resolve(message.d.responseData);
            else request.reject(new Error('OBS could not return the requested statistics.'));
          }
        } catch { if (!settled) finish(new Error('OBS returned an invalid handshake. Check the server and port.')); else disconnect(); }
      });
      peer.on('error', () => { if (!settled) finish(new Error('Could not connect to OBS on this PC. Open OBS → Tools → WebSocket Server Settings and check the port.')); else disconnect(); });
      peer.on('close', () => { if (!settled) finish(new Error('OBS rejected or closed the connection. Check the WebSocket password.')); else if (socket === peer) disconnect(); });
    });
  }
  function request(type) {
    if (!ready || !socket) return Promise.reject(new Error('OBS is not connected.'));
    if (!['GetStats', 'GetStreamStatus', 'GetRecordStatus'].includes(type)) return Promise.reject(new Error('Unsupported OBS request.'));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('OBS statistics timed out.')); }, 3000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ op: 6, d: { requestType: type, requestId: id } }), error => { if (error && pending.has(id)) { pending.delete(id); clearTimeout(timer); reject(new Error('OBS connection failed.')); } });
    });
  }
  return { connect, disconnect, status: () => ({ connected: ready }),
    sample: async () => {
      const [stats, stream, recording] = await Promise.all(['GetStats', 'GetStreamStatus', 'GetRecordStatus'].map(request));
      const counter = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
      return { renderSkipped: counter(stats.renderSkippedFrames), renderTotal: counter(stats.renderTotalFrames), encodeSkipped: counter(stats.outputSkippedFrames), encodeTotal: counter(stats.outputTotalFrames), streamSkipped: counter(stream.outputSkippedFrames), streamTotal: counter(stream.outputTotalFrames), streaming: stream.outputActive === true, recording: recording.outputActive === true, streamReconnecting: stream.outputReconnecting === true, recordingPaused: recording.outputPaused === true };
    },
  };
}
module.exports = { createObsClient };
