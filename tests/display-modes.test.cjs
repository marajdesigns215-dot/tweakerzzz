const { test } = require('node:test');
const assert = require('node:assert/strict');

test('display choices never invent native modes, and selected values remain a supported pair', async () => {
  const { parseDisplayModes, supportedSelection, displayAspect } = await import('../src/lib/display-modes.ts');
  const wide = { width: 3440, height: 1440, refreshRate: 100 };
  const modes = parseDisplayModes([wide, wide, { width: 2560, height: 1440, refreshRate: 75 }]);
  assert.equal(modes.length, 2);
  assert.deepEqual(supportedSelection(modes, '1920x1080', 60), wide);
  assert.equal(supportedSelection(modes, '2560x1440', 60).refreshRate, 75);
  assert.equal(displayAspect('3440x1440'), '43:18');
  assert.equal(displayAspect('1728x1080'), '8:5');
  assert.equal(displayAspect('1440x1080'), '4:3');
  assert.throws(() => parseDisplayModes([]), /did not report/);
  for (const bad of [null, {}, [null], [{ ...wide, refreshRate: 0 }], [{ ...wide, width: '3440' }]]) assert.throws(() => parseDisplayModes(bad), /invalid/);
});
