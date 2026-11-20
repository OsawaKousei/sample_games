import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trial, replay } from './difficulty.mjs';

test('standing still and simple circling fail during the opening phase', () => {
  for (const policy of ['idle', 'circle']) {
    const result = trial({ policy });
    assert.equal(result.status, 'lost');
    assert.ok(result.seconds < 45, `${policy}: ${result.seconds}`);
  }
});

test('a recorded route clears with half-second inputs and a limited health margin', () => {
  const recording = JSON.parse(readFileSync(new URL('./fixtures/learned-route.json', import.meta.url), 'utf8'));
  assert.equal(recording.actions[0].frame, 12);
  for (let i = 1; i < recording.actions.length; i++) assert.ok(recording.actions[i].frame - recording.actions[i - 1].frame >= 30);
  const result = replay(recording);
  assert.equal(result.status, 'won');
  assert.equal(result.seconds, 135);
  assert.ok(result.hp > 0 && result.hp < result.maxHp * .4, `HP ${result.hp}/${result.maxHp}`);
  assert.ok(result.upgrades >= 5);
  assert.ok(result.blockedBolts > 0);
});
