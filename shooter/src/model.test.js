import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, tick, bomb, snapshot, WAVE_DURATIONS, WIDTH, HEIGHT, MOVE_SPEED, FOCUS_SPEED } from './model.js';
import { queueAttack } from './patterns.js';
import { BOSS_PHASE_HP } from './choreography.js';
const advance = (s, seconds, input = {}) => { for (let i = 0; i < Math.ceil(seconds / .02); i++) tick(s, .02, input); };
const emptyArena = (stage = 0) => {
  const s = createGame(() => .5); s.status = 'playing'; s.stage = stage; s.autoFire = false;
  s.time = WAVE_DURATIONS[stage]; s.bossSpawned = true; return s;
};
const bossArena = stage => {
  const s = emptyArena(stage); s.bossSpawned = false; tick(s, .02); s.boss.y = 125; return s;
};

test('normal movement is faster, diagonals and touch are normalized, focus remains precise', () => {
  for (const target of [false, true]) {
    const s = emptyArena();
    advance(s, .2, target ? { target: { x: 440, y: 820 } } : { x: 1, y: 1 });
    assert.ok(Math.abs(s.player.x - WIDTH / 2 - MOVE_SPEED * .2 / Math.sqrt(2)) < .01);
    assert.ok(Math.abs(s.player.y - 620 - MOVE_SPEED * .2 / Math.sqrt(2)) < .01);
  }
  const s = emptyArena();
  advance(s, .2, { x: 1, focus: true }); assert.ok(Math.abs(s.player.x - 240 - FOCUS_SPEED * .2) < .01);
  advance(s, 3, { x: 1, y: 1 }); assert.equal(s.player.x, WIDTH - 20); assert.equal(s.player.y, HEIGHT - 28);
  queueAttack(s, 'petals', 240, 120); s.status = 'paused';
  const before = JSON.stringify({ ...s, random: null }); tick(s, .05, { x: -1 });
  assert.equal(JSON.stringify({ ...s, random: null }), before);
});

test('swept collision catches fast bullets, grants invulnerability and ends the run', () => {
  const s = emptyArena(); s.player.hp = 2;
  s.bullets.push({ x: s.player.x - 40, y: s.player.y, vx: 1600, vy: 0, radius: 3.5 });
  tick(s, .05); assert.equal(s.player.hp, 1); assert.ok(s.player.invincible > 0);
  s.bullets.push({ x: s.player.x, y: s.player.y, vx: 0, vy: 0, radius: 3.5 });
  tick(s, .02); assert.equal(s.player.hp, 1);
  s.player.invincible = 0;
  s.bullets.push({ x: s.player.x, y: s.player.y, vx: 0, vy: 0, radius: 3.5 });
  tick(s, .02); assert.equal(s.status, 'lost');
});

test('powerups enhance shots; bombs clear current AND scheduled attacks and warnings', () => {
  const s = bossArena(0);
  s.pickups.push({ x: s.player.x, y: s.player.y, kind: 'power' }); tick(s, .02);
  assert.equal(s.player.power, 2);
  const hp = s.boss.hp;
  queueAttack(s, 'spiral', 240, 120); s.bullets.push({ x: 0, y: 0 });
  assert.equal(bomb(s), true);
  assert.equal(s.bullets.length + s.salvos.length + s.cues.length, 0);
  assert.equal(s.boss.hp, hp - 70); assert.equal(s.bombs, 1);
  // The cancelled burst must not resume after the bomb's invincibility ends.
  s.boss = null; advance(s, 2); assert.equal(s.bullets.length, 0);
});

test('bosses arrive at each authored stage duration and all phases lead to victory', () => {
  const s = createGame(() => .5); s.status = 'playing'; s.autoFire = false; s.player.invincible = 999;
  for (let stage = 0; stage < 3; stage++) {
    assert.equal(s.stage, stage); s.time = WAVE_DURATIONS[stage] - .1;
    tick(s, .02); assert.equal(s.boss, null);
    advance(s, .12); assert.ok(s.boss);
    s.boss.y = 125;
    if (stage === 0) { s.boss.hp = 119; tick(s, .02); assert.equal(s.boss.phase, 2); }
    else for (let phase = 1; phase < BOSS_PHASE_HP[stage].length; phase++) {
      s.boss.hp = BOSS_PHASE_HP[stage].slice(phase).reduce((a, b) => a + b, 0);
      tick(s, .02); assert.equal(s.boss.phase, phase + 1);
      assert.ok(s.boss.breakTime > 0);
      assert.equal(s.bullets.length + s.salvos.length + s.cues.length, 0);
      advance(s, 1.12);
    }
    s.boss.hp = 0; tick(s, .02);
    assert.equal(s.status, stage < 2 ? 'transition' : 'won');
    if (stage < 2) { advance(s, 3.02); assert.equal(s.encounter, 0); }
  }
  assert.equal(s.score, 15000);
});

test('bombs cannot skip a boss phase; the next phase starts with a clean field', () => {
  const s = bossArena(2), floor = BOSS_PHASE_HP[2].slice(1).reduce((a, b) => a + b, 0);
  s.boss.hp = floor + 10;
  bomb(s); assert.equal(s.boss.hp, floor);
  tick(s, .02); assert.equal(s.boss.phase, 2);
  const hp = s.boss.hp; bomb(s); assert.equal(s.boss.hp, hp);
  advance(s, 1.2); assert.equal(s.boss.phase, 2);
  assert.equal(snapshot(s).boss.phaseCount, 4);
});

test('warning locks aimed burst before firing, and destroying its source cancels it', () => {
  const s = emptyArena(2);
  s.player.x = 100; queueAttack(s, 'stream', 240, 120, true);
  assert.equal(s.bullets.length, 0); assert.equal(s.cues.length, 1);
  s.player.x = 400; advance(s, .64); assert.equal(s.bullets.length, 0);
  advance(s, .06); assert.ok(s.bullets.length > 0);
  assert.ok(s.bullets.every(b => b.vx < 0), 'the burst must aim at the old position');
  const killed = emptyArena(1);
  killed.enemies.push({ id: 42, hp: 0, x: 100, baseX: 100, y: 100, age: 0, speed: 0, seed: 0, fire: 99, radius: 16 });
  queueAttack(killed, 'spiral', 100, 100, false, 0, .65, 42);
  advance(killed, 2); assert.equal(killed.bullets.length, 0); assert.equal(killed.cues.length, 0);
});

test('scripted encounters are reproducible despite cosmetic randomness and use distinct attacks', () => {
  for (const stage of [1, 2]) {
    const states = [createGame(() => .1), createGame(() => .9)], seen = new Set();
    for (const s of states) { s.status = 'playing'; s.stage = stage; s.autoFire = false; s.player.invincible = 999; }
    let peak = 0;
    for (let i = 0; i < WAVE_DURATIONS[stage] * 50; i++) {
      for (const s of states) tick(s, .02);
      for (const cue of states[0].cues) seen.add(cue.pattern);
      peak = Math.max(peak, states[0].bullets.length);
    }
    assert.equal(seen.size, 8);
    assert.deepEqual(states[0].bullets, states[1].bullets);
    assert.deepEqual(states[0].enemies, states[1].enemies);
    assert.ok(peak > (stage === 2 ? 350 : 220));
    assert.ok(peak < 1400, 'density must remain practical for the renderer');
  }
});

test('every boss phase changes choreography, including the reprise', () => {
  for (const stage of [1, 2]) for (let phase = 1; phase <= BOSS_PHASE_HP[stage].length; phase++) {
    const s = bossArena(stage); s.player.invincible = 999; s.boss.phase = phase;
    s.boss.hp = BOSS_PHASE_HP[stage].slice(phase - 1).reduce((a, b) => a + b, 0);
    const seen = new Set(), openings = [];
    let lastCycle = -1, peak = 0;
    for (let i = 0; i < 2400; i++) {
      tick(s, .02);
      for (const cue of s.cues) seen.add(cue.pattern);
      if (s.boss.cycle !== lastCycle && s.cues.length) { openings.push(s.cues[0].pattern); lastCycle = s.boss.cycle; }
      peak = Math.max(peak, s.bullets.length);
    }
    assert.ok(seen.size >= 6); assert.ok(peak < 1400);
    assert.notEqual(openings[0], openings[1]);
  }
});

test('narrow moving curtains have a survivable learned route in every gate position', () => {
  for (let variant = 0; variant < 7; variant++) {
    const s = emptyArena(2); queueAttack(s, 'gate', 240, 120, true, variant);
    const gapX = s.cues[0].gapX, direction = variant % 2 ? -1 : 1;
    s.player.x = gapX;
    for (let i = 0; i < 350; i++) {
      const firstArrival = .65 + (620 + 12) / 245;
      const row = Math.max(0, Math.min(5, (s.totalTime - firstArrival) / .34));
      tick(s, .02, { target: { x: gapX + direction * row * 9, y: 620 }, focus: true });
    }
    assert.equal(s.player.hp, 5, `gate ${variant} must be navigable without a bomb`);
  }
});

test('standing still or blindly sweeping no longer clears the later stages at full power', () => {
  for (const stage of [1, 2]) for (const sweep of [false, true]) {
    const s = createGame(() => .5); s.status = 'playing'; s.stage = stage; s.player.power = 3;
    for (let i = 0; i < 7000 && s.status === 'playing'; i++) {
      tick(s, .02, sweep ? { target: { x: 240 + 200 * Math.sin(s.totalTime * .65), y: 620 } } : {});
    }
    assert.equal(s.status, 'lost');
    assert.ok(s.totalTime < WAVE_DURATIONS[stage]);
  }
});
