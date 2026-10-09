'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { FrameMetrics, csvFields } = require('../electron/fps-metrics.cjs');
const { createCaptureManager, validateCapture, validateSessionId, verifyCollector, listPrograms } = require('../electron/capture.cjs');
const header = 'Application,ProcessID,SwapChainAddress,FrameTime\r\n';
const row = (ms, pid = 10, chain = '0x123') => `game.exe,${pid},${chain},${ms}\r\n`;
const options = { processName: 'game.exe', seconds: 30, context: 'Gaming', phase: 'before', scenario: '1080p benchmark' };

test('frame metrics use elapsed frame time, preserve slow frames and separate render streams', () => {
  const metrics = new FrameMetrics('game.exe');
  const data = '\uFEFF' + header + row(0) + row('NA') + row('Infinity') + row(100) + row(10).repeat(99) + row(1, 11, '0x456').repeat(20) + 'other.exe,1,0x123,1\r\n';
  for (let index = 0; index < data.length; index += 7) metrics.push(data.slice(index, index + 7));
  metrics.end(); const result = metrics.summary();
  assert.equal(result.frames, 100); assert.equal(result.averageFps, 100000 / 1090);
  assert.equal(result.onePercentLow, 10); assert.equal(result.p95FrameMs, 10);
  assert.equal(result.sampledSeconds, 1.09); assert.equal(result.otherStreamFrames, 20);
  assert.equal(result.invalidFrames, 2); assert.equal(result.zeroFrameRows, 1); assert.equal(result.processId, 10);
  assert.deepEqual(csvFields('"game,name.exe",10,"a""b",12'), ['game,name.exe', '10', 'a"b', '12']);
});
test('empty, short, incompatible and bounded frame streams do not fabricate results', () => {
  const empty = new FrameMetrics('game.exe'); empty.push(header); assert.equal(empty.summary(), null);
  const short = new FrameMetrics('game.exe', 2); short.push(header + row(16).repeat(3));
  assert.equal(short.summary().frames, 2); assert.equal(short.summary().onePercentLow, null); assert.equal(short.limited, true);
  assert.throws(() => new FrameMetrics('game.exe').push('Application,ProcessID,Unexpected\n'), /Unsupported/);
});
test('capture IPC validation rejects paths, option injection, long or invalid values', () => {
  assert.deepEqual(validateCapture({ ...options, extra: 'ignored' }), options);
  for (const mutation of [{ processName: '--help' }, { processName: 'C:\\game.exe' }, { processName: '$(whoami).exe' }, { seconds: 0 }, { seconds: 3601 }, { seconds: 30.5 }, { phase: 'anything' }, { context: 'anything' }, { scenario: '' }, { scenario: '\ncommand' }]) assert.throws(() => validateCapture({ ...options, ...mutation }));
  for (const id of ['../../file', 'x'.repeat(32), {}, null]) assert.throws(() => validateSessionId(id));
});
test('collector verification rejects replaced executable bytes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tz-integrity-'));
  try { const file = path.join(dir, 'bad.exe'); await fs.writeFile(file, 'not the collector'); await assert.rejects(verifyCollector(file), /integrity/); }
  finally { await fs.rm(dir, { recursive: true, force: true }); }
});
async function harness({ readPrograms = async () => ['game.exe'] } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tz-capture-'));
  const children = [], calls = [], stopped = [];
  const manager = createCaptureManager({ directory, executable: 'bundled.exe', verify: async () => {}, readPrograms, snapshot: async () => ({ checkedAt: new Date().toISOString(), tweaks: [] }),
    launch(file, args, launchOptions) {
      calls.push({ file, args, options: launchOptions });
      const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => child.emit('close', 1); children.push(child); return child;
    },
    async run(file, args) {
      stopped.push({ file, args });
      // Frames still buffered when Stop is clicked must be processed.
      if (children.length) { children.at(-1).stdout.write(row(20)); setImmediate(() => children.at(-1).emit('close', 0)); }
    },
  });
  return { manager, directory, calls, children, stopped, cleanup: () => fs.rm(directory, { recursive: true, force: true }) };
}
test('program inventory is a fixed read-only query and returns selectable unique names', async () => {
  const calls = [];
  const names = await listPrograms({ environment: { SystemRoot: 'C:\\Windows' }, run: async (...args) => {
    calls.push(args); return '\uFEFF' + JSON.stringify(['Marvel-Win64-Shipping', 'marvel-win64-shipping', 'Other Game', null, 42, '--help', 'Bad\\Path']);
  } });
  assert.deepEqual(names, ['Marvel-Win64-Shipping.exe', 'Other Game.exe']);
  assert.match(calls[0][1].at(-1), /Get-Process/);
  assert.ok(!calls[0][1].at(-1).includes('Marvel'));
  await assert.rejects(listPrograms({ run: async () => '{"unexpected":"object"}' }), /unreadable program list/);
});
test('a missing process is rejected without a trace or recording, and the slot is released for retry', async () => {
  let programs = ['OtherGame.exe'];
  const h = await harness({ readPrograms: async () => programs });
  try {
    await assert.rejects(h.manager.start(options), /game.exe is not in the running program list/);
    assert.equal(h.calls.length, 0);
    assert.equal(h.manager.isActive(), false);
    assert.deepEqual(await fs.readdir(h.directory), []);
    programs = ['Game.EXE'];
    const started = await h.manager.start(options);
    assert.equal(started.processName, 'Game.EXE');
    assert.ok(Number.isFinite(Date.parse(started.targetCheckedAt)));
    assert.equal(h.calls[0].args[h.calls[0].args.indexOf('--process_name') + 1], 'Game.EXE');
    h.children[0].stdout.write(header + row(10).repeat(100));
    assert.equal((await h.manager.stop()).status, 'completed');
    assert.equal((await h.manager.list())[0].processName, 'Game.EXE');
  } finally { await h.cleanup(); }
});
test('inventory failures do not become a false claim that a game is absent, and permit retry', async () => {
  const h = await harness({ readPrograms: async () => { throw new Error('Windows query timed out'); } });
  try {
    await assert.rejects(h.manager.start(options), /Could not check the running game.*timed out/);
    assert.equal(h.manager.isActive(), false);
    assert.equal(h.calls.length, 0);
    assert.deepEqual(await h.manager.list(), []);
  } finally { await h.cleanup(); }
});
test('a verified running process without frame events remains unsuccessful with diagnostic context', async () => {
  const h = await harness();
  try {
    await h.manager.start(options);
    h.children[0].stdout.write(header);
    h.children[0].stderr.write('Collector diagnostic fixture');
    h.children[0].emit('close', 0);
    for (let i = 0; i < 100 && h.manager.isActive(); i++) await new Promise(resolve => setTimeout(resolve, 5));
    const [record] = await h.manager.list();
    assert.equal(record.status, 'failed'); assert.equal(record.summary, null);
    assert.match(record.error, /process was found before recording/);
    assert.equal(record.collectorWarnings, 'Collector diagnostic fixture');
    assert.ok(record.targetCheckedAt);
  } finally { await h.cleanup(); }
});
test('Marvel Rivals uses its render executable and running matches are exact and case-insensitive', async () => {
  const { gameProfiles, matchGame, runningGamePrograms } = await import('../src/data/game-profiles.ts');
  const game = gameProfiles.find(item => item.id === 'rivals');
  assert.equal(game.executables[0], 'marvel-win64-shipping.exe');
  assert.equal(matchGame('Marvel-Win64-Shipping.exe').id, 'rivals');
  assert.equal(matchGame('MarvelLauncher.exe').id, 'generic');
  assert.deepEqual(runningGamePrograms(game, ['MarvelLauncher.exe', 'Marvel-Win64-Shipping.exe', 'NotMarvel-Win64-Shipping.exe']), ['Marvel-Win64-Shipping.exe']);
});
test('recording lifetime saves raw CSV and snapshot, stops only its own session and deletes by ID', async () => {
  const h = await harness();
  try {
    const started = h.manager.start(options);
    await assert.rejects(h.manager.start(options), /already running/);
    const state = await started;
    h.children[0].stdout.write(header + row(10).repeat(100));
    await assert.rejects(h.manager.remove(state.id), /Stop recording/);
    const result = await h.manager.stop();
    assert.equal(result.status, 'completed'); assert.equal(result.summary.frames, 101);
    assert.equal(h.manager.status().active, false);
    assert.equal(h.calls[0].options.shell, false);
    assert.ok(h.calls[0].args.includes('--no_track_input'));
    assert.ok(!h.calls[0].args.includes('--track_frame_type'));
    assert.ok(h.calls[0].args.includes('--no_track_display'));
    assert.equal(result.captureMethod, 'presentmon-application');
    assert.deepEqual(h.stopped[0].args, ['--session_name', 'Tweakerzzz-' + state.id, '--terminate_existing_session']);
    const history = await h.manager.list(); assert.equal(history.length, 1); assert.deepEqual(history[0].settings.tweaks, []);
    assert.ok((await fs.readFile(await h.manager.csvPath(state.id), 'utf8')).endsWith(row(20)));
    await h.manager.remove(state.id); assert.equal((await h.manager.list()).length, 0);
    await assert.rejects(h.manager.csvPath(state.id), /not found/);
  } finally { await h.cleanup(); }
});
test('Gaming, Streaming, and Recording capture FPS without an OBS client or connection', async () => {
  const h = await harness();
  try {
    for (const context of ['Gaming', 'Streaming', 'Recording']) {
      await h.manager.start({ ...options, context });
      h.children.at(-1).stdout.write(header + row(10).repeat(100));
      const result = await h.manager.stop();
      assert.equal(result.status, 'completed'); assert.ok(result.summary.averageFps > 0); assert.equal(result.context, context);
    }
    assert.equal((await h.manager.list()).length, 3);
  } finally { await h.cleanup(); }
});
test('permission failures and interrupted runs are retained as unsuccessful recordings', async () => {
  const h = await harness();
  try {
    await h.manager.start(options);
    h.children[0].stderr.write('failed to start trace session: access denied');
    h.children[0].emit('close', 6);
    for (let i = 0; i < 100 && h.manager.isActive(); i++) await new Promise(resolve => setTimeout(resolve, 5));
    const [failed] = await h.manager.list(); assert.equal(failed.status, 'failed'); assert.equal(failed.summary, null); assert.match(failed.error, /Run as administrator/);
    const stale = { ...failed, id: 'a'.repeat(32), status: 'recording' };
    await fs.writeFile(path.join(h.directory, stale.id + '.json'), JSON.stringify(stale));
    const stopped = [];
    const recovered = createCaptureManager({ directory: h.directory, executable: 'bundled.exe', verify: async () => {}, snapshot: async () => {}, run: async (_file, args) => stopped.push(args) });
    const history = await recovered.list(); assert.equal(history.find(r => r.id === stale.id).status, 'interrupted');
    assert.equal(stopped.length, 1); assert.equal(stopped[0][1], 'Tweakerzzz-' + stale.id);
  } finally { await h.cleanup(); }
});
test('before/after comparison requires matching conditions and discloses state changes', async () => {
  const { compareCaptures } = await import('../src/lib/capture-comparison.ts');
  const before = { ...options, id: '1', status: 'completed', startedAt: '2026-10-08T01:00:00Z', summary: { averageFps: 100, onePercentLow: 60, p95FrameMs: 20, sampledSeconds: 60 }, settings: { tweaks: [{ id: 'game-mode', status: 'not-enabled' }] } };
  const after = { ...before, id: '2', phase: 'after', startedAt: '2026-10-08T02:00:00Z', summary: { ...before.summary, averageFps: 110, onePercentLow: 66 }, settings: { tweaks: [{ id: 'game-mode', status: 'enabled' }] } };
  assert.equal(compareCaptures(before, after).average, 10); assert.equal(compareCaptures(before, after).low, 10);
  assert.deepEqual(compareCaptures(before, after).changed, ['game-mode']);
  for (const change of [{ context: 'Streaming' }, { scenario: 'other scene' }, { processName: 'other.exe' }, { status: 'failed' }, { startedAt: before.startedAt }, { phase: 'before' }]) assert.equal(compareCaptures(before, { ...after, ...change }), null);
});


test('a malformed final CSV row still closes the collector and persists an unsuccessful run', async () => {
  const h = await harness();
  try {
    await h.manager.start(options);
    h.children[0].stdout.write('Application,Unexpected');
    const record = await h.manager.stop();
    assert.equal(record.status, 'failed'); assert.match(record.error, /Unsupported PresentMon CSV/);
    assert.equal(h.manager.isActive(), false);
    assert.equal((await h.manager.list())[0].status, 'failed');
  } finally { await h.cleanup(); }
});

test('damaged recording files stay on disk while valid history and new recordings remain usable', async () => {
  const h = await harness();
  try {
    await h.manager.start(options); h.children[0].stdout.write(header + row(10).repeat(100));
    const good = await h.manager.stop();
    const corrupt = [
      ['a'.repeat(32), '{incomplete'],
      ['b'.repeat(32), JSON.stringify({ ...good, id: 'b'.repeat(32), settings: null })],
      ['c'.repeat(32), JSON.stringify({ ...good, id: 'c'.repeat(32), telemetrySummary: { enabled: true, obs: null } })],
      ['d'.repeat(32), JSON.stringify({ ...good, id: 'd'.repeat(32), summary: { ...good.summary, averageFps: 'broken' } })],
      ['e'.repeat(32), JSON.stringify({ ...good, id: 'e'.repeat(32), hardware: { gpu: null } })],
    ];
    for (const [id, content] of corrupt) await fs.writeFile(path.join(h.directory, id + '.json'), content);
    assert.deepEqual((await h.manager.list()).map(r => r.id), [good.id]);
    assert.equal(h.manager.status().historyWarnings.length, 5);
    for (const [id, content] of corrupt) assert.equal(await fs.readFile(path.join(h.directory, id + '.json'), 'utf8'), content);
    await h.manager.start(options); h.children.at(-1).stdout.write(header + row(12).repeat(100));
    assert.equal((await h.manager.stop()).status, 'completed');
    assert.equal((await h.manager.list()).length, 2);
  } finally { await h.cleanup(); }
});

test('ordinary comparisons reject asymmetric snapshots and flag legacy hardware as unverified', async () => {
  const { compareCaptures } = await import('../src/lib/capture-comparison.ts');
  const b = { ...options, id: 'a', status: 'completed', startedAt: '2026-10-08T01:00:00Z', summary: { averageFps: 100, onePercentLow: 60, p95FrameMs: 20, sampledSeconds: 60 }, settings: { tweaks: [] } };
  const a = { ...b, id: 'b', phase: 'after', startedAt: '2026-10-08T02:00:00Z' };
  assert.equal(compareCaptures(b, a).hardwareUnverified, true);
  assert.equal(compareCaptures({ ...b, hardwareKey: 'known' }, a), null);
  assert.equal(compareCaptures(b, { ...a, hardwareKey: 'known' }), null);
  const benchmark = { experiment: 'test', resolution: '1440p', graphics: 'low', gameBuild: '1', fpsCap: 0, verified: true };
  assert.equal(compareCaptures({ ...b, benchmark }, a), null);
  assert.equal(compareCaptures(b, { ...a, benchmark }), null);
  assert.equal(compareCaptures({ ...b, hardwareKey: 'same', benchmark }, { ...a, hardwareKey: 'same', benchmark }).hardwareUnverified, false);
});

test('saved CSV recalculation preserves original bytes and metadata, survives reload and rejects malformed data', async () => {
  const h = await harness();
  try {
    await h.manager.start(options); h.children[0].stdout.write(header + row(10).repeat(100));
    const original = await h.manager.stop();
    const source = await h.manager.csvPath(original.id), metadata = path.join(h.directory, original.id + '.json');
    const oldBytes = await fs.readFile(metadata, 'utf8');
    const raw = 'Application,ProcessID,SwapChainAddress,CPUStartTime,FrameTime\n' + Array.from({length:201}, (_, i) => `game.exe,10,0x1,${i*5},.3\ngame.exe,10,0x1,${i*5},5\n`).join('');
    await fs.writeFile(source, raw);
    const revised = await h.manager.reanalyze(original.id);
    assert.equal(revised.summary.averageFps, 200); assert.equal(revised.summary.duplicateRows, 201);
    assert.ok(revised.reanalyzedAt); assert.equal((await h.manager.list())[0].summary.averageFps, 200);
    assert.equal(await fs.readFile(source, 'utf8'), raw);
    assert.equal(await fs.readFile(path.join(h.directory, original.id + '.before-analysis.json'), 'utf8'), oldBytes);
    await h.manager.reanalyze(original.id);
    assert.equal(await fs.readFile(path.join(h.directory, original.id + '.before-analysis.json'), 'utf8'), oldBytes);
    const saved = await fs.readFile(metadata, 'utf8'); await fs.writeFile(source, 'Application,Unexpected\n');
    await assert.rejects(h.manager.reanalyze(original.id), /Unsupported/);
    assert.equal(await fs.readFile(metadata, 'utf8'), saved);
    await assert.rejects(h.manager.reanalyze('../../bad'), /Invalid recording/);
    await h.manager.remove(original.id); assert.deepEqual(await fs.readdir(h.directory), []);
  } finally { await h.cleanup(); }
});

test('optional display tracking is explicit and provides an actionable fallback without invented FPS', async () => {
  const h = await harness();
  try {
    await assert.rejects(h.manager.start({ ...options, displayTracking: 'on' }), /Invalid display/);
    await h.manager.start({ ...options, displayTracking: true });
    assert.ok(h.calls[0].args.includes('--track_frame_type')); assert.ok(!h.calls[0].args.includes('--no_track_display'));
    h.children[0].emit('close', 0);
    for (let i = 0; i < 100 && h.manager.isActive(); i++) await new Promise(resolve => setTimeout(resolve, 5));
    const [record] = await h.manager.list(); assert.equal(record.status, 'failed'); assert.equal(record.summary, null);
    assert.match(record.error, /Turn off Collect displayed FPS/); assert.equal(record.captureMethod, 'presentmon-display-v2');
  } finally { await h.cleanup(); }
});
