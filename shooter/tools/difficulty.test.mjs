import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/model.js';
import { addLaser } from '../src/lasers.js';
import { copyState, probe, clearance, trial, stationaryClear, controlTiming } from './difficulty.mjs';

function emptyArena() {
  const s = createGame(() => .5);
  s.status = 'playing'; s.autoFire = false; s.time = 25; s.bossSpawned = true;
  return s;
}
test('counterfactual probes preserve the real state and enforce input delay', () => {
  const s = emptyArena();
  s.bullets.push({ x: 270, y: 620, vx: -200, vy: 0, age: 0, radius: 3.5 });
  const original = JSON.stringify(s);
  const left = { x: -1, y: 0 }, idle = { x: 0, y: 0 };
  assert.equal(probe(s, left, idle, 0).safe, true);
  const late = probe(s, left, idle, 12);
  assert.equal(late.safe, false);
  assert.ok(late.hitAt < .2);
  assert.equal(JSON.stringify(s), original);
  const copy = copyState(s); copy.bullets[0].x = 0;
  assert.equal(s.bullets[0].x, 270);
});
test('clearance excludes warning geometry but the forecast includes beam activation', () => {
  const s = emptyArena(); addLaser(s, 240, 0, 240, 720, { warning: .2 });
  assert.equal(clearance(s), 64);
  assert.equal(probe(s, {}, {}, 0).safe, false);
  s.lasers[0].age = .2;
  assert.ok(clearance(s) < 0);
});
test('repeat runs are deterministic and survival is censored rather than a clear', () => {
  const options = { stage: 2, bossPhase: 2, seconds: .3, x: 240, reactionMs: 200, holdMs: 300 };
  assert.deepEqual(trial(options), trial(options));
  const r = trial(options);
  assert.equal(r.survived, true); assert.equal(r.firstHitSeconds, null);
  assert.equal(r.observedSeconds, .3);
  assert.throws(() => trial({ ...options, holdMs: 16 }), RangeError);
  const c = stationaryClear({ stage: 2, bossPhase: 2, x: 240, seconds: .3 });
  assert.equal(c.cleared, false); assert.equal(c.timeout, true);
});

test('control candidates use indivisible reaction and hold blocks, with an auditable input log', () => {
  assert.deepEqual(controlTiming(), { reactionFrames: 12, holdFrames: 18, blockFrames: 30 });
  assert.throws(() => controlTiming(-1, 300), RangeError);
  assert.throws(() => controlTiming(200, NaN), RangeError);
  const s = emptyArena();
  const right = { x: 1, focus: true }, idle = { x: 0 };
  const r = probe(s, right, idle, 12, 30);
  assert.ok(Math.abs(r.state.player.x - 240 - 90 * .3) < 1e-8);
  const run = trial({ stage: 2, bossPhase: 3, seconds: 8 });
  assert.ok(run.inputs.length > 1, 'exercise actual command changes');
  for (let i = 1; i < run.inputs.length; i++) {
    const change = run.inputs[i];
    assert.ok(Math.abs((change.time - .2) / .5 - Math.round((change.time - .2) / .5)) < 1e-8);
    if (i > 1) assert.ok(change.time - run.inputs[i - 1].time >= .5 - 1e-8);
  }
  for (let i = 0; i < run.timeline.length; i++) {
    assert.equal(run.timeline[i].time, i * .5);
    assert.ok(Math.abs(run.timeline[i].applyTime - i * .5 - .2) < 1e-8);
  }
});
