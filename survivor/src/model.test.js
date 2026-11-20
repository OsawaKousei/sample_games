import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, tick, chooseUpgrade, spawnEnemy, snapshot, TOTAL_SECONDS, UPGRADES } from './model.js';
import { WORLD_RADIUS, OBSTACLES, blocked, segmentBlocked, moveBody, terrainHeight, terrainSpeed, navigationTo, isHighGround } from './field.js';
const advance = (s, seconds, input = {}) => { for (let i = 0; i < Math.round(seconds * 60); i++) tick(s, 1 / 60, input); };
const arena = () => { const s = createRun(() => .5); s.status = 'playing'; s.spawnTimer = s.itemTimer = 999; return s; };

test('crystals and multiple XP levels queue exactly three-way choices and freeze gameplay', () => {
  const s = arena(); s.xp = 19;
  for (let i = 0; i < 2; i++) s.items.push({ id: ++s.id, x: s.player.x, z: s.player.z, kind: 'upgrade', life: 5 });
  tick(s, .02); assert.equal(s.status, 'upgrade'); assert.equal(s.pendingUpgrades, 4); assert.equal(s.level, 3); assert.equal(s.xp, 0);
  assert.deepEqual(UPGRADES.map(u => u.id), ['power', 'mobility', 'guard']);
  const before = snapshot(s); tick(s, .05, { x: 1, dash: true }); assert.deepEqual(snapshot(s), before);
  assert.equal(chooseUpgrade(s, 'invalid'), false); assert.equal(s.pendingUpgrades, 4);
  for (const id of ['power', 'mobility', 'guard', 'power']) assert.equal(chooseUpgrade(s, id), true);
  assert.equal(s.status, 'playing'); assert.equal(s.pendingUpgrades, 0); assert.equal(s.stats.damage, 24); assert.equal(s.stats.pierce, 1);
  assert.ok(Math.abs(s.stats.speed - 6.75) < 1e-8); assert.equal(s.player.maxHp, 108);
  assert.equal(chooseUpgrade(s, 'guard'), false);
});

test('upgrade limits reject spent choices, durability heals, and retries start clean', () => {
  const s = arena(); s.player.hp = 40; s.pendingUpgrades = 20; s.status = 'upgrade';
  for (let i = 0; i < 3; i++) chooseUpgrade(s, 'mobility');
  const remaining = s.pendingUpgrades; assert.equal(chooseUpgrade(s, 'mobility'), false); assert.equal(s.pendingUpgrades, remaining);
  for (let i = 0; i < 8; i++) chooseUpgrade(s, 'power');
  assert.equal(chooseUpgrade(s, 'power'), false); assert.equal(s.stats.damage, 40); assert.equal(s.stats.pierce, 2);
  chooseUpgrade(s, 'guard'); assert.equal(s.player.hp, 50); assert.equal(s.player.maxHp, 108);
  while(s.pendingUpgrades) chooseUpgrade(s, 'guard'); assert.ok(s.stats.armor <= .2);
  const fresh = createRun(); assert.equal(fresh.build.length, 0); assert.equal(fresh.pendingUpgrades, 0); assert.equal(fresh.player.hp, 100);
});

test('movement and dashes cannot tunnel through any wall or the outer boundary', () => {
  for (const wall of OBSTACLES) {
    const p = { x: wall.x - wall.width / 2 - 2, z: wall.z };
    assert.equal(moveBody(p, wall.width + 5, 0, .5), true);
    assert.ok(p.x <= wall.x - wall.width / 2 - .5 + 1e-8); assert.equal(blocked(p.x, p.z), false);
    moveBody(p, 0, wall.depth + 2, .5); assert.ok(p.z > wall.z + wall.depth / 2);
  }
  const p = { x: 0, z: 0 }; moveBody(p, 100, 100); assert.ok(Math.hypot(p.x, p.z) <= WORLD_RADIUS - .5 + 1e-8);
  const s = arena(); s.player.x = -10; s.player.z = 0; advance(s, .2, { x: 1, dash: true });
  assert.equal(blocked(s.player.x, s.player.z), false); assert.ok(s.dashCooldown > 0); assert.ok(s.player.invincible > 0);
  s.status = 'paused'; const before = snapshot(s); advance(s, 1, { x: 1 }); assert.deepEqual(snapshot(s), before);
});

test('mud slows movement and hills give a real elevation, uphill cost and combat advantage', () => {
  assert.ok(terrainHeight(-14, -10) > 3); assert.ok(isHighGround(-14, -10));
  assert.ok(terrainSpeed(0, 0, 1, 0) < .7);
  assert.ok(terrainSpeed(-8, -10, -1, 0, true) < terrainSpeed(-8, -10, -1, 0));
  const high = arena(); high.player.x = -14; high.player.z = -10;
  spawnEnemy(high, 'crawler', { x: -14, z: 2 }); high.enemies[0].warmup = 0; high.enemies[0].speed = 0;
  tick(high, .02); assert.equal(high.shots.length, 1); assert.equal(high.shots[0].damage, high.stats.damage * 1.2);
  const flat = arena(); flat.player.x = -14; flat.player.z = 0;
  spawnEnemy(flat, 'crawler', { x: -14, z: 12 }); flat.enemies[0].warmup = 0; flat.enemies[0].speed = 0;
  tick(flat, .02); assert.equal(flat.shots.length, 0);
});

test('walls occlude auto-aim, both projectile types, and XP attraction', () => {
  assert.ok(segmentBlocked(-12, 0, 0, 0)); assert.equal(segmentBlocked(-12, 7, 0, 7), false);
  const s = arena(); s.player.x = -10; s.player.z = 0;
  spawnEnemy(s, 'crawler', { x: -4, z: 0 }); s.enemies[0].warmup = 0; s.enemies[0].speed = 0;
  tick(s, .02); assert.equal(s.shots.length, 0);
  s.bolts.push({ id: ++s.id, x: -4, z: 0, vx: -30, vz: 0, life: 3, damage: 30 });
  s.shots.push({ id: ++s.id, x: -10, z: 0, vx: 30, vz: 0, life: 3, damage: 999, remaining: 1, hitIds: [] });
  advance(s, .4); assert.equal(s.player.hp, 100); assert.ok(s.enemies[0].hp > 0); assert.equal(s.bolts.length, 0); assert.equal(s.metrics.blockedBolts, 1);
  s.player.x = -8.8; const item = { id: ++s.id, x: -5.2, z: 0, kind: 'xp', value: 1, life: 10 }; s.items.push(item);
  advance(s, .2); assert.equal(item.x, -5.2);
});

test('ordinary enemies navigate around cover, while a committed charge hits it and stuns', () => {
  const s = arena(); s.player.x = 0; s.player.z = 0; s.shotTimer = 999; s.player.invincible = 999;
  spawnEnemy(s, 'crawler', { x: -12, z: 0 }); const e = s.enemies[0]; e.warmup = 0;
  s.navigation = navigationTo(0, 0); advance(s, 9);
  assert.ok(Math.hypot(e.x, e.z) < 2, `enemy must route around the wall: ${e.x},${e.z}`);
  assert.equal(blocked(e.x, e.z, e.radius), false);
  const charge = arena(); charge.player.x = 0; charge.player.z = 0; charge.shotTimer = 999;
  spawnEnemy(charge, 'runner', { x: -12, z: 0 }); const runner = charge.enemies[0];
  Object.assign(runner, { warmup: 0, charge: .95, aimX: 1, aimZ: 0 }); advance(charge, .4);
  assert.ok(runner.stunned > 0); assert.equal(runner.charge, 0); assert.equal(charge.metrics.stunnedCharges, 1); assert.equal(charge.player.hp, 100);
});

test('attack warnings track first, then lock for the final 350ms before firing', () => {
  const s = arena(); s.player.x = -14; s.player.z = 0; s.shotTimer = 999;
  spawnEnemy(s, 'ranger', { x: -14, z: -10 }); const e = s.enemies[0];
  Object.assign(e, { warmup: 0, windup: .8, aimX: 1, aimZ: 0 });
  tick(s, .05); assert.ok(e.aimZ > .9);
  e.windup = .3; const aim = [e.aimX, e.aimZ]; s.player.x = -20;
  advance(s, .2); assert.deepEqual([e.aimX, e.aimZ], aim); assert.equal(s.bolts.length, 0);
  advance(s, .15); assert.equal(s.bolts.length, 1);
  assert.ok(Math.abs(s.bolts[0].vx - aim[0] * 10) < 1e-8);
});

test('spawns are warned, reproducible, distant and independent of cosmetic randomness', () => {
  const a = createRun(() => .1), b = createRun(() => .9);
  for(const s of [a,b]) { s.status = 'playing'; s.player.invincible = 999; advance(s, 12); }
  assert.deepEqual(a.enemies, b.enemies); assert.deepEqual(a.items, b.items);
  assert.ok(a.enemies.some(e => e.type === 'runner'));
  for(const s of [a,b]) { s.player.x = 26; s.player.z = 0; spawnEnemy(s); const e = s.enemies.at(-1); assert.ok(e.warmup >= .8); assert.ok(Math.hypot(e.x-s.player.x,e.z-s.player.z)>=13); assert.equal(blocked(e.x,e.z,e.radius),false); }
});

test('lethal contact cannot be undone by simultaneous rewards; victory is at 135 seconds', () => {
  const s = arena(); s.player.hp = 1; spawnEnemy(s, 'brute', s.player); s.enemies[0].warmup = 0;
  s.items.push({ id: ++s.id, x: s.player.x, z: s.player.z, kind: 'upgrade', life: 5 }); s.xp = s.nextXp;
  tick(s, .02); assert.equal(s.status, 'lost'); assert.equal(s.pendingUpgrades, 0); assert.equal(s.player.hp, 0);
  const win = arena(); win.time = TOTAL_SECONDS - .01; tick(win, .02); assert.equal(win.status, 'won'); assert.equal(win.time, TOTAL_SECONDS);
});
