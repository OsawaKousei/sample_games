import { WORLD_RADIUS, PLAYER_RADIUS, SUPPLIES, terrainHeight, isHighGround, isMud, segmentBlocked, moveBody, terrainSpeed, freePoint, navigationTo, pursuitTarget } from './field.js';
export { WORLD_RADIUS, terrainHeight } from './field.js';
export const PHASE_SECONDS = 45, TOTAL_SECONDS = PHASE_SECONDS * 3;
export const PHASES = [{ name: 'PHASE 1', color: '#bdea9f' }, { name: 'PHASE 2', color: '#ffd18c' }, { name: 'PHASE 3', color: '#f6a5af' }];
export const UPGRADES = [
  { id: 'power', maxLevel: 8, icon: 'ϟ', name: '火力', detail: '攻撃力 +4（最大40）・攻撃間隔 −0.03秒（最短0.48秒）。2回ごとに貫通数 +1（最大2）。' },
  { id: 'mobility', maxLevel: 3, icon: '»', name: '機動力', detail: '移動速度 +0.35・回避の待ち時間 −0.3秒。最大3回。' },
  { id: 'guard', icon: '✚', name: '耐久力', detail: '最大体力 +8・体力10回復・被ダメージ −4%（最大20%）。' },
];
export function seededRandom(seed = 314159) { let n = seed >>> 0; return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; }; }
export function createRun(random = Math.random, seed = 314159) {
  return { status: 'ready', time: 0, phase: 0, player: { x: 0, z: 7, hp: 100, maxHp: 100, invincible: 0, angle: 0 },
    stats: { speed: 6.4, interval: .72, range: 10, damage: 16, pierce: 0, dashDelay: 3.5, armor: 0 },
    enemies: [], shots: [], bolts: [], items: [], particles: [], arrivals: [], kills: 0, xp: 0, nextXp: 8, level: 1, build: [], pendingUpgrades: 0,
    shotTimer: 0, spawnTimer: .4, itemTimer: 8, supplyIndex: 0, wave: 0, id: 0, random, gameRandom: seededRandom(seed), seed,
    hurt: 0, dash: 0, dashCooldown: 0, navigation: navigationTo(0, 7), navTimer: 0,
    metrics: { hits: 0, damage: 0, firstHit: null, stunnedCharges: 0, blockedBolts: 0, highGroundSeconds: 0, mudSeconds: 0 } };
}
export function burst(s, x, z, color, count = 8) {
  for (let i = 0; i < count; i++) { const a = s.random() * Math.PI * 2, speed = 1 + s.random() * 4; s.particles.push({ id: ++s.id, x, z, y: .8, vx: Math.cos(a) * speed, vz: Math.sin(a) * speed, vy: 3 + s.random() * 3, life: .7, color }); }
  if (s.particles.length > 180) s.particles.splice(0, s.particles.length - 180);
}
export function chooseUpgrade(s, id) {
  if (s.status !== 'upgrade' || s.pendingUpgrades < 1 || !UPGRADES.some(u => u.id === id)) return false;
  const definition = UPGRADES.find(u => u.id === id);
  if (s.build.filter(u => u === id).length >= (definition.maxLevel || Infinity)) return false;
  s.build.push(id); const n = s.build.filter(u => u === id).length;
  if (id === 'power') { s.stats.damage = Math.min(40, s.stats.damage + 4); s.stats.interval = Math.max(.48, s.stats.interval - .03); s.stats.pierce = Math.min(2, Math.floor(n / 2)); }
  if (id === 'mobility') { s.stats.speed = Math.min(7.45, s.stats.speed + .35); s.stats.dashDelay = Math.max(2.6, s.stats.dashDelay - .3); }
  if (id === 'guard') { s.player.maxHp += 8; s.player.hp = Math.min(s.player.maxHp, s.player.hp + 10); s.stats.armor = Math.min(.2, s.stats.armor + .04); }
  s.pendingUpgrades--; s.status = s.pendingUpgrades ? 'upgrade' : 'playing'; return true;
}
export function spawnEnemy(s, type, point) {
  const roll = s.gameRandom();
  type ||= s.time < 7 ? 'crawler' : s.time < 18 ? (roll < .45 ? 'runner' : 'crawler') : roll < .23 ? 'ranger' : roll < .56 ? 'runner' : s.phase === 2 && roll < .75 ? 'brute' : 'crawler';
  const spec = { crawler: { hp: 42 + s.phase * 6, speed: 3.25, radius: .6, damage: 14 }, runner: { hp: 34, speed: 3.8, radius: .45, damage: 18 }, brute: { hp: 125, speed: 3, radius: .95, damage: 24 }, ranger: { hp: 38, speed: 2.9, radius: .55, damage: 12 } }[type];
  const a = s.wave * 2.39996 + (s.gameRandom() - .5) * .4;
  let target = point || (s.wave < 2 ? { x: s.wave ? -13 : 13, z: 7 } : { x: Math.cos(a) * 26, z: Math.sin(a) * 26 });
  if (!point && Math.hypot(target.x - s.player.x, target.z - s.player.z) < (s.wave < 2 ? 10 : 13)) target = { x: -target.x, z: -target.z };
  target = freePoint(target.x, target.z, spec.radius);
  s.enemies.push({ id: ++s.id, ...target, type, ...spec, maxHp: spec.hp, hit: 0, warmup: .8, attackTimer: 1 + roll, windup: 0, charge: 0, stunned: 0, vx: 0, vz: 0, aimX: 0, aimZ: 0 });
  s.wave++;
}
function damagePlayer(s, amount) {
  const p = s.player; if (p.invincible > 0 || s.status !== 'playing') return;
  amount *= 1 - s.stats.armor;
  s.metrics.hits++; s.metrics.damage += Math.min(p.hp, amount); s.metrics.firstHit ??= s.time;
  p.hp = Math.max(0, p.hp - amount); p.invincible = .7; s.hurt = .3; burst(s, p.x, p.z, '#ffd5be', 8);
  if (!p.hp) s.status = 'lost';
}
export function segmentHits(x, z, ax, az, bx, bz, radius) {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return (x - ax - t * dx) ** 2 + (z - az - t * dz) ** 2 < radius ** 2;
}
function updateEnemy(s, e, dt, oldPlayer) {
  const p = s.player; e.hit = Math.max(0, e.hit - dt);
  if (e.warmup > 0) { e.warmup -= dt; return; }
  if (e.stunned > 0) { e.stunned -= dt; e.vx = e.vz = 0; return; }
  const oldX = e.x, oldZ = e.z, d = Math.hypot(p.x - e.x, p.z - e.z);
  if (e.windup > 0) {
    // Track during the orange warning; lock the final 350ms so it can be read.
    if (e.windup > .35) { e.aimX = (p.x - e.x) / (d || 1); e.aimZ = (p.z - e.z) / (d || 1); }
    e.windup -= dt;
    if (e.windup <= 0) {
      if (e.type === 'runner') e.charge = .95;
      else {
        for (const offset of s.phase === 2 ? [-.36, -.18, 0, .18, .36] : s.phase ? [-.18, 0, .18] : [0]) {
          const a = Math.atan2(e.aimZ, e.aimX) + offset;
          s.bolts.push({ id: ++s.id, x: e.x, z: e.z, vx: Math.cos(a) * (s.phase === 2 ? 12 : 10), vz: Math.sin(a) * (s.phase === 2 ? 12 : 10), life: 4, damage: 16 });
        }
        e.attackTimer = 2.5 - s.phase * .3;
      }
    }
  } else if (e.charge > 0) {
    e.charge -= dt;
    if (moveBody(e, e.aimX * 14 * dt, e.aimZ * 14 * dt, e.radius)) { e.charge = 0; e.stunned = 1.7; s.metrics.stunnedCharges++; }
    if (e.charge <= 0) e.attackTimer = s.phase === 2 ? 1.7 : 2.5;
  } else {
    e.attackTimer -= dt;
    const visible = !segmentBlocked(e.x, e.z, p.x, p.z);
    if (e.attackTimer <= 0 && d < (e.type === 'runner' ? 16 : 20) && visible && ['runner', 'ranger'].includes(e.type)) {
      e.aimX = (p.x - e.x) / (d || 1); e.aimZ = (p.z - e.z) / (d || 1); e.windup = e.type === 'runner' ? .8 : .9;
    } else if (!(e.type === 'ranger' && visible && d < 14)) {
      const target = pursuitTarget(e, p, s.navigation), dx = target.x - e.x, dz = target.z - e.z, length = Math.hypot(dx, dz) || 1;
      const speed = e.speed * terrainSpeed(e.x, e.z, dx, dz, true);
      moveBody(e, dx / length * speed * dt, dz / length * speed * dt, e.radius);
    }
  }
  e.vx = (e.x - oldX) / dt; e.vz = (e.z - oldZ) / dt;
  if (segmentHits(0, 0, oldX - oldPlayer.x, oldZ - oldPlayer.z, e.x - p.x, e.z - p.z, e.radius + PLAYER_RADIUS)) damagePlayer(s, e.damage);
}
export function tick(s, dt, input = {}) {
  if (s.status !== 'playing') return;
  dt = Math.max(0, Math.min(dt, .05)); if (!dt) return;
  s.time = Math.min(TOTAL_SECONDS, s.time + dt); s.phase = Math.min(2, Math.floor(s.time / PHASE_SECONDS));
  if (s.time >= TOTAL_SECONDS - 1e-8) { s.time = TOTAL_SECONDS; s.status = 'won'; return; }
  const p = s.player, oldPlayer = { x: p.x, z: p.z };
  p.invincible = Math.max(0, p.invincible - dt); s.hurt = Math.max(0, s.hurt - dt);
  s.dashCooldown = Math.max(0, s.dashCooldown - dt); s.dash = Math.max(0, s.dash - dt);
  if (input.dash && !s.dashCooldown) { s.dash = .22; s.dashCooldown = s.stats.dashDelay; p.invincible = Math.max(p.invincible, .32); }
  const dx = input.x || 0, dz = input.z || 0, length = Math.max(1, Math.hypot(dx, dz));
  const speed = s.stats.speed * terrainSpeed(p.x, p.z, dx, dz) * (s.dash ? 2.6 : 1);
  moveBody(p, dx / length * speed * dt, dz / length * speed * dt);
  if (dx || dz) p.angle = Math.atan2(dx, dz);
  if (isHighGround(p.x, p.z)) s.metrics.highGroundSeconds += dt;
  if (isMud(p.x, p.z)) s.metrics.mudSeconds += dt;
  s.navTimer -= dt; if (s.navTimer <= 0) { s.navTimer = .5; s.navigation = navigationTo(p.x, p.z); }
  s.spawnTimer -= dt;
  if (s.spawnTimer <= 0) { s.spawnTimer += [.85, .62, .43][s.phase]; if (s.enemies.length < 70) spawnEnemy(s); }
  s.itemTimer -= dt;
  if (s.itemTimer <= 0) {
    s.itemTimer += 20; const spot = SUPPLIES[s.supplyIndex++ % SUPPLIES.length];
    s.items.push({ id: ++s.id, ...spot, kind: 'upgrade', life: 28 });
    if (s.supplyIndex % 2) s.items.push({ id: ++s.id, ...freePoint(spot.x + 1.8, spot.z), kind: 'health', life: 28 });
  }
  s.shotTimer -= dt;
  if (s.shotTimer <= 0) {
    const high = isHighGround(p.x, p.z), range = s.stats.range + (high ? 4 : 0);
    const target = s.enemies.filter(e => e.hp > 0 && e.warmup <= 0 && Math.hypot(e.x - p.x, e.z - p.z) < range && !segmentBlocked(p.x, p.z, e.x, e.z, .1)).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (target) { const d = Math.hypot(target.x - p.x, target.z - p.z) || 1; s.shotTimer = s.stats.interval;
      s.shots.push({ id: ++s.id, x: p.x, z: p.z, vx: (target.x - p.x) / d * 25, vz: (target.z - p.z) / d * 25, life: range / 25, damage: s.stats.damage * (high ? 1.2 : 1), remaining: 1 + s.stats.pierce, hitIds: [] }); }
  }
  for (const shot of s.shots) {
    const ox = shot.x, oz = shot.z; shot.x += shot.vx * dt; shot.z += shot.vz * dt; shot.life -= dt;
    if (segmentBlocked(ox, oz, shot.x, shot.z, .1)) { shot.life = 0; continue; }
    for (const e of s.enemies) if (e.hp > 0 && e.warmup <= 0 && !shot.hitIds.includes(e.id) && segmentHits(e.x, e.z, ox, oz, shot.x, shot.z, e.radius + .2)) {
      e.hp -= shot.damage; e.hit = .12; shot.hitIds.push(e.id); burst(s, e.x, e.z, '#d7fbaa', 2);
      if (--shot.remaining <= 0) { shot.life = 0; break; }
    }
  }
  s.shots = s.shots.filter(b => b.life > 0);
  for (const e of s.enemies) if (e.hp > 0) updateEnemy(s, e, dt, oldPlayer);
  for (const bolt of s.bolts) {
    const ox = bolt.x, oz = bolt.z; bolt.x += bolt.vx * dt; bolt.z += bolt.vz * dt; bolt.life -= dt;
    if (segmentBlocked(ox, oz, bolt.x, bolt.z, .15)) { bolt.life = 0; s.metrics.blockedBolts++; }
    else if (segmentHits(0, 0, ox - oldPlayer.x, oz - oldPlayer.z, bolt.x - p.x, bolt.z - p.z, .75)) { damagePlayer(s, bolt.damage); bolt.life = 0; }
  }
  s.bolts = s.bolts.filter(b => b.life > 0);
  for (const e of s.enemies) if (e.hp <= 0) { s.kills++; burst(s, e.x, e.z, '#dbaaee', 5); s.items.push({ id: ++s.id, x: e.x, z: e.z, kind: 'xp', value: e.type === 'brute' ? 3 : 1, life: 45 }); }
  s.enemies = s.enemies.filter(e => e.hp > 0);
  for (const item of s.items) {
    item.life -= dt;
    if (s.status !== 'playing') continue;
    const ax = p.x - item.x, az = p.z - item.z, d = Math.hypot(ax, az);
    if (item.kind === 'xp' && d < 4.5 && d > .1 && !segmentBlocked(item.x, item.z, p.x, p.z, .1)) { item.x += ax / d * Math.min(d, 10 * dt); item.z += az / d * Math.min(d, 10 * dt); }
    if (d < 1.25) { item.life = 0; if (item.kind === 'xp') s.xp += item.value; if (item.kind === 'health') p.hp = Math.min(p.maxHp, p.hp + 12); if (item.kind === 'upgrade') s.pendingUpgrades++; }
  }
  s.items = s.items.filter(i => i.life > 0);
  while (s.xp >= s.nextXp && s.status === 'playing') { s.xp -= s.nextXp; s.nextXp = Math.round(s.nextXp * 1.35); s.level++; s.pendingUpgrades++; }
  if (s.pendingUpgrades && s.status === 'playing') s.status = 'upgrade';
  for (const pt of s.particles) { pt.life -= dt; pt.x += pt.vx * dt; pt.z += pt.vz * dt; pt.y += pt.vy * dt; pt.vy -= 14 * dt; }
  s.particles = s.particles.filter(pt => pt.life > 0);
}
export function snapshot(s) {
  return { status: s.status, time: s.time, phase: s.phase, hp: s.player.hp, maxHp: s.player.maxHp, xp: s.xp, nextXp: s.nextXp, level: s.level, kills: s.kills, pendingUpgrades: s.pendingUpgrades, build: [...s.build], stats: { ...s.stats }, dashCooldown: s.dashCooldown, hurt: s.hurt,
    terrain: isHighGround(s.player.x, s.player.z) ? '高台：射程 +4・威力 +20%' : isMud(s.player.x, s.player.z) ? 'ぬかるみ：移動速度 −32%' : '平地' };
}
