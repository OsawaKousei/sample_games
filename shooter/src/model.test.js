import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, createCheckpoint, tick, bomb, snapshot, WAVE_DURATIONS, WIDTH, HEIGHT, MOVE_SPEED, FOCUS_SPEED } from './model.js';
import { queueAttack } from './patterns.js';
import { BOSS_PHASE_HP } from './choreography.js';
import { DEBUG_ENTRIES, parseDebugPath } from './debug.js';
import { addLaser, laserActive, laserHits } from './lasers.js';
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
      assert.equal('breakTime' in s.boss, false);
      assert.equal(s.bullets.length + s.salvos.length + s.cues.length, 0);
      advance(s, .02);
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
  const hp = s.boss.hp; bomb(s); assert.equal(s.boss.hp, hp - 70);
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
  for (const stage of [1]) {
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
  for (const stage of [1]) for (let phase = 1; phase <= BOSS_PHASE_HP[stage].length; phase++) {
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


test('phase changes and attack-cycle wraps never teleport or pause the boss', () => {
  for (const stage of [1, 2]) {
    const s = createCheckpoint({ stage, bossPhase: 1 }, () => .5);
    s.status = 'playing'; s.autoFire = false; s.player.invincible = 999;
    const maxStep = (stage === 2 ? 135 : 100) * .48 * .02 + .0001;
    for (let phase = 1; phase < BOSS_PHASE_HP[stage].length; phase++) {
      advance(s, 3.2);
      const before = { x: s.boss.x, y: s.boss.y };
      s.boss.hp = BOSS_PHASE_HP[stage].slice(phase).reduce((a, b) => a + b, 0);
      tick(s, .02);
      assert.equal(s.boss.phase, phase + 1);
      assert.ok(Math.abs(s.boss.x - before.x) <= maxStep);
      assert.equal(s.boss.y, before.y);
      assert.equal(s.lasers.length + s.salvos.length + s.cues.length + s.bullets.length, 0);
      const clock = s.boss.phaseTime;
      for (let frame = 0; frame < 1000; frame++) {
        const x = s.boss.x; tick(s, .02);
        assert.ok(Math.abs(s.boss.x - x) <= maxStep, 'movement must stay continuous across the reprise');
      }
      assert.ok(s.boss.phaseTime > clock);
      assert.ok(s.bullets.length + s.salvos.length > 0, 'the next phase starts without a preparation pause');
    }
  }
});

test('all debug paths initialize full resources, clean fields, and the exact selected phase', () => {
  assert.equal(DEBUG_ENTRIES.length, 12);
  for (const entry of DEBUG_ENTRIES) {
    const parsed = parseDebugPath(entry.path);
    assert.equal(parsed.stage, entry.stage); assert.equal(parsed.bossPhase, entry.bossPhase);
    const s = createCheckpoint(parsed, () => .5);
    assert.equal(s.status, 'ready'); assert.equal(s.player.hp, 5);
    assert.equal(s.player.power, 3); assert.equal(s.bombs, 3); assert.equal(s.score, 0);
    assert.equal(s.player.invincible, 0); assert.equal(s.debug, true);
    assert.equal(s.bullets.length + s.lasers.length + s.salvos.length + s.cues.length + s.enemies.length, 0);
    if (entry.bossPhase) {
      assert.equal(s.boss.phase, entry.bossPhase); assert.equal(s.boss.phaseTime, 0);
      assert.equal(s.boss.hp, BOSS_PHASE_HP[entry.stage].slice(entry.bossPhase - 1).reduce((a, b) => a + b, 0));
      assert.equal(s.boss.y, 125);
    } else { assert.equal(s.boss, null); assert.equal(s.time, 0); }
    const before = snapshot(s); tick(s, .05); assert.deepEqual(snapshot(s), before);
  }
  assert.equal(parseDebugPath('/'), null);
  assert.deepEqual(parseDebugPath('/debug'), { index: true, invalid: false });
  assert.deepEqual(parseDebugPath('/debug/boss/1/phase/9'), { index: true, invalid: true });
  for (const bad of [{ stage: 3 }, { stage: -1 }, { stage: 0, bossPhase: 3 }, { stage: 2, bossPhase: 0 }]) {
    assert.throws(() => createCheckpoint(bad), RangeError);
  }
});

test('laser warnings and fades are harmless; the active finite beam catches a crossing player', () => {
  const s = emptyArena(2); addLaser(s, 240, 100, 240, 650);
  const laser = s.lasers[0];
  assert.equal(laserActive(laser), false);
  assert.equal(laserHits(laser, 230, 620, 250, 620), false);
  laser.age = laser.warning;
  assert.equal(laserHits(laser, 230, 620, 250, 620), true);
  assert.equal(laserHits(laser, 240, 680, 240, 680), false, 'finite endpoints must match the drawing');
  laser.age = laser.warning + laser.duration;
  assert.equal(laserHits(laser, 240, 620, 240, 620), false);
  laser.age = 1; s.player.x = 240;
  tick(s, .02); assert.equal(s.player.hp, 4);
  s.status = 'paused'; const age = laser.age; tick(s, .02); assert.equal(laser.age, age);
  s.status = 'playing'; bomb(s); assert.equal(s.lasers.length, 0);
});

test('stage 3 is shorter and combines new dense fronts, aimed bursts and timed laser compartments', () => {
  assert.equal(WAVE_DURATIONS[2], 30);
  const states = [createCheckpoint({ stage: 2 }, () => .1), createCheckpoint({ stage: 2 }, () => .9)];
  for (const s of states) { s.status = 'playing'; s.autoFire = false; s.player.invincible = 999; }
  let peak = 0, overlap = false;
  for (let frame = 0; frame < 1499; frame++) {
    for (const s of states) tick(s, .02);
    peak = Math.max(peak, states[0].bullets.length);
    overlap ||= states[0].lasers.some(laserActive) && states[0].bullets.some(b => b.color === 0xffd88c);
  }
  assert.ok(peak > 350); assert.ok(peak < 1800); assert.equal(overlap, true);
  assert.deepEqual(states[0].bullets, states[1].bullets);
  assert.deepEqual(states[0].lasers, states[1].lasers);
  advance(states[0], .1); assert.ok(states[0].boss);
  assert.equal(states[0].lasers.length, 0, 'the stage ends with a clean boss entrance');
});

test('stage 3 boss homages use ordinary round bullets with different spatial demands', () => {
  for (const phase of [1, 2, 3, 4]) {
    const s = createCheckpoint({ stage: 2, bossPhase: phase }, () => .5);
    s.status = 'playing'; s.autoFire = false; s.player.invincible = 999;
    const colors = new Set(); let peak = 0, retargeted = false;
    for (let frame = 0; frame < 1800; frame++) {
      tick(s, .02);
      peak = Math.max(peak, s.bullets.length);
      for (const b of s.bullets) { colors.add(b.color); assert.equal(b.radius, 3.5); retargeted ||= !!b.retargeted; }
      assert.equal(s.lasers.length, 0);
    }
    assert.ok(peak < 1800); assert.ok(colors.size >= 2);
    if (phase === 1) assert.ok(peak > 900);
    if (phase === 2) assert.equal(retargeted, true);
    if (phase === 3) { assert.ok(colors.has(0xffd88c)); assert.ok(colors.has(0xd6acff)); }
    if (phase === 4) { assert.equal(s.boss.intensity, 3); assert.equal(colors.size, 4); }
  }
});

test('the final homage escalates by damage as well as time', () => {
  const s = createCheckpoint({ stage: 2, bossPhase: 4 }); s.status = 'playing'; s.autoFire = false;
  advance(s, .5); assert.equal(s.boss.intensity, 0);
  s.boss.hp = 130; tick(s, .02); assert.equal(s.boss.intensity, 3);
  assert.ok(s.boss.attackClock.blue); assert.ok(s.boss.attackClock.gold);
});

test('optimized collision agrees with a swept-circle reference for fast and moving targets', () => {
  let seed = 9721;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < 1500; i++) {
    const s = emptyArena(), oldX = s.player.x, oldY = s.player.y;
    const b = { x: oldX + (random() - .5) * 160, y: oldY + (random() - .5) * 160,
      vx: (random() - .5) * 4000, vy: (random() - .5) * 4000, radius: 3.5, age: 0 };
    const x1 = b.x - oldX, y1 = b.y - oldY;
    const bx = b.x + b.vx * .05, by = b.y + b.vy * .05;
    s.bullets.push(b);
    tick(s, .05, { x: random() * 2 - 1, y: random() * 2 - 1 });
    const dx = bx - s.player.x - x1, dy = by - s.player.y - y1;
    const t = Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / (dx * dx + dy * dy || 1)));
    const hit = Math.hypot(x1 + t * dx, y1 + t * dy) < 6.5;
    assert.equal(s.player.hp, hit ? 4 : 5);
  }
});

test('laser partitions overlap locked aimed beams and leave a learned escape route', () => {
  const s = createCheckpoint({ stage: 2 }, () => .5);
  s.status = 'playing'; s.autoFire = false; s.time = 8.2; s.player.x = 264;
  const centers = [264, 232, 216, 248, 264, 232];
  let overlap = false, volleys = 0, lastId = 0;
  const locked = new Map();
  for (let frame = 0; frame < 900; frame++) {
    const beat = Math.max(0, Math.min(5, Math.floor((s.time - 8.2 + 1e-8) / 2.4)));
    const local = s.time - 8.2 - beat * 2.4;
    // Bait near the center, sidestep the aimed pair, then use the short release
    // to enter the next compartment. Test beams alone so failures locate traps.
    const x = local < .25 && beat > 0 ? centers[beat - 1] - 18 : centers[beat] - (local >= 1.3 ? 18 : 0);
    const oldX = s.player.x, oldY = s.player.y;
    s.bullets = [];
    tick(s, 1 / 60, { target: { x, y: 620 }, focus: true });
    const active = s.lasers.filter(laserActive);
    overlap ||= active.some(l => l.x1 === l.x2) && active.some(l => l.x1 !== l.x2);
    assert.ok(!s.lasers.some(l => laserHits(l, oldX, oldY, s.player.x, s.player.y)), 'the learned route must avoid every beam');
    for (const l of s.lasers) {
      if (l.x1 === l.x2) {
        if (l.id > lastId) { volleys++; lastId = l.id; }
      } else {
        const geometry = [l.x1, l.y1, l.x2, l.y2];
        if (locked.has(l.id)) assert.deepEqual(geometry, locked.get(l.id), 'aim must not track after warning');
        else locked.set(l.id, geometry);
      }
    }
  }
  assert.equal(overlap, true); assert.ok(volleys >= 36); assert.equal(locked.size, 12);
  // A player who camps in a compartment must now be caught by the aimed beams.
  const camper = createCheckpoint({ stage: 2 }, () => .5);
  camper.status = 'playing'; camper.autoFire = false; camper.time = 8.2; camper.player.x = 264;
  while (camper.time < 11) { camper.bullets = []; tick(camper, 1 / 60); }
  assert.ok(camper.player.hp < 5);
});
