const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WebSocketServer } = require('ws');
const { createHash } = require('node:crypto');
const { createObsClient } = require('../electron/obs.cjs');
const { parseGpu, parseCpuTemperature, obsDelta, createTelemetry } = require('../electron/telemetry.cjs');

test('telemetry keeps unsupported sensors unknown and matches GPU identity', () => {
  assert.equal(parseGpu('Other GPU,99,80,2000,8000', 'GPU A'), null);
  const gpu = parseGpu('GPU A,99,[N/A],2000,8000', 'GPU A');
  assert.equal(gpu.utilization, 99); assert.equal(gpu.temperature, null);
  assert.equal(parseGpu('GPU A,101,-1,NA,8000', 'GPU A').utilization, null);
  assert.equal(parseCpuTemperature(JSON.stringify([{ Identifier: '/intelcpu/0/temperature/0', Name: 'CPU Package', Value: 65 }])).value, 65);
  assert.equal(parseCpuTemperature(JSON.stringify([{ Identifier: '/lpc/0/temperature/0', Name: 'CPU Package', Value: 65 }])), null);
  assert.equal(parseCpuTemperature(JSON.stringify([{ Identifier: '/intelcpu/0/temperature/0', Name: 'CPU Package', Value: 999 }])), null);
  const before = { renderSkipped: 10, renderTotal: 1000, encodeSkipped: 20, encodeTotal: 1000, streamSkipped: 0, streamTotal: 1000 };
  const after = { renderSkipped: 12, renderTotal: 1100, encodeSkipped: 23, encodeTotal: 1100, streamSkipped: 1, streamTotal: 1100, streaming: true };
  assert.equal(obsDelta(before, after).renderingLagPercent, 2); assert.equal(obsDelta(before, after).encodingLagPercent, 3); assert.equal(obsDelta(before, after).networkDropPercent, 1);
  assert.equal(obsDelta(after, before).renderingLagPercent, null); assert.equal(obsDelta(before, after, true).encodingLagPercent, null);
});
test('OBS authenticates locally, issues only statistics reads, and disconnects cleanly', async () => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 }); await new Promise(resolve => server.on('listening', resolve));
  const client = createObsClient(), requests = [], password = 'local-test-secret';
  const sha = value => createHash('sha256').update(value).digest('base64');
  server.on('connection', peer => {
    peer.send(JSON.stringify({ op: 0, d: { authentication: { salt: 'salt', challenge: 'challenge' } } }));
    peer.on('message', raw => {
      const message = JSON.parse(raw);
      assert.ok(!raw.toString().includes(password));
      if (message.op === 1) { assert.equal(message.d.authentication, sha(sha(password + 'salt') + 'challenge')); assert.equal(message.d.eventSubscriptions, 0); peer.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } })); }
      else { requests.push(message.d.requestType); peer.send(JSON.stringify({ op: 7, d: { requestId: message.d.requestId, requestStatus: { result: true }, responseData: message.d.requestType === 'GetStats' ? { renderSkippedFrames: 5, renderTotalFrames: 100, outputSkippedFrames: 2, outputTotalFrames: 100 } : { outputActive: true, outputSkippedFrames: 1, outputTotalFrames: 100 } } })); }
    });
  });
  try {
    await assert.rejects(client.connect({ port: 80, password }), /port/);
    await client.connect({ port: server.address().port, password });
    assert.equal(client.status().connected, true); assert.equal((await client.sample()).renderSkipped, 5);
    assert.deepEqual(requests.sort(), ['GetRecordStatus', 'GetStats', 'GetStreamStatus']);
    client.disconnect(); assert.equal(client.status().connected, false); await assert.rejects(client.sample(), /not connected/);
  } finally { client.disconnect(); await new Promise(resolve => server.close(resolve)); }
});
test('telemetry failures do not invent CPU/GPU temperatures or OBS lag', async () => {
  let ticks = 0;
  const host = { cpus: () => [{ times: { idle: ++ticks * 50, user: ticks * 50 } }], totalmem: () => 100, freemem: () => 20 };
  const telemetry = createTelemetry({ host, hardware: { gpu: { name: 'AMD GPU' } }, exists: () => false, execute: async () => '[]' });
  const result = await telemetry.stop();
  assert.equal(result.cpu.averagePercent, 50); assert.equal(result.memory.peakPercent, 80);
  assert.equal(result.gpu.averagePercent, null); assert.equal(result.gpu.peakTemperatureC, null); assert.equal(result.cpuTemperatureC, null); assert.equal(result.obs.encodingLagPercent, null);
  assert.ok(result.warnings.some(w => w.includes('CPU package temperature unavailable')));
});
