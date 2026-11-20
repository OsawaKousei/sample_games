import { emit, queueAttack, updateBarrage } from './patterns.js';
import { updateStage3Route, updateStage3Boss } from './stage3.js';
import { updateLasers, laserHits } from './lasers.js';
import { WAVE_DURATIONS, ENCOUNTERS, BOSS_SCORES, BOSS_PHASE_HP } from './choreography.js';
export { WAVE_DURATIONS } from './choreography.js';
export const WIDTH = 480, HEIGHT = 720, WAVE_SECONDS = 25;
export const MOVE_SPEED = 360, FOCUS_SPEED = 90, PLAYER_RADIUS = 3;
export const STAGES = [
  { name: 'STAGE 1', color: '#7ce6e9', rgb: 0x7ce6e9, background: 0x071b2b },
  { name: 'STAGE 2', color: '#ffbe77', rgb: 0xffbe77, background: 0x291b26 },
  { name: 'STAGE 3', color: '#c8a1ff', rgb: 0xc8a1ff, background: 0x1c1534 },
];
export function createGame(random = Math.random) {
  return { status: 'ready', stage: 0, time: 0, totalTime: 0,
    player: { x: WIDTH / 2, y: HEIGHT - 100, hp: 5, maxHp: 5, power: 1, invincible: 0 },
    enemies: [], bullets: [], shots: [], particles: [], pickups: [], cues: [], salvos: [], lasers: [], routeClock: {},
    boss: null, bossSpawned: false, score: 0, kills: 0, bombs: 2,
    shotTimer: 0, spawnTimer: .4, encounter: 0, id: 0, wave: 0, random, shake: 0, flash: 0,
    transition: 0, shotsFired: 0, hits: 0, autoFire: true };
}
export function createCheckpoint({ stage, bossPhase }, random = Math.random) {
  if (!Number.isInteger(stage) || stage < 0 || stage >= STAGES.length ||
      (bossPhase !== undefined && (!Number.isInteger(bossPhase) || bossPhase < 1 || bossPhase > BOSS_PHASE_HP[stage].length))) {
    throw new RangeError('Invalid shooter checkpoint');
  }
  const s = createGame(random);
  s.stage = stage; s.debug = true; s.checkpoint = { stage, bossPhase };
  s.player.power = 3; s.bombs = 3;
  if (bossPhase !== undefined) {
    s.time = WAVE_DURATIONS[stage]; spawnBoss(s);
    s.boss.y = 125; s.boss.phase = bossPhase;
    s.boss.hp = BOSS_PHASE_HP[stage].slice(bossPhase - 1).reduce((sum, hp) => sum + hp, 0);
    s.flash = 0;
  }
  return s;
}

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export function explosion(s, x, y, color = 0xffbe77, count = 20) {
  for (let i = 0; i < count; i++) {
    const a = s.random() * Math.PI * 2, v = 30 + s.random() * 160;
    s.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: .35 + s.random() * .4, max: .75, color, size: 1 + s.random() * 3 });
  }
  if (s.particles.length > 400) s.particles.splice(0, s.particles.length - 400);
}
function aimed(s, x, y, count = 1, spread = .18, speed = 145) {
  const a = Math.atan2(s.player.y - y, s.player.x - x);
  for (let i = 0; i < count; i++) emit(s, x, y, a + (i - (count - 1) / 2) * spread, speed, { radius: 4, color: 0xff8c95 });
}
function damage(s) {
  const p = s.player;
  if (p.invincible > 0) return;
  p.hp = Math.max(0, p.hp - 1); p.invincible = 1.5; s.shake = .3;
  explosion(s, p.x, p.y, 0x9eeeff, 14);
  if (!p.hp) s.status = 'lost';
}
function clearBarrage(s) { s.bullets = []; s.salvos = []; s.cues = []; s.lasers = []; }
function phaseFloor(s) { return BOSS_PHASE_HP[s.stage].slice(s.boss.phase).reduce((sum, hp) => sum + hp, 0); }
function hitBoss(s, amount) {
  const b = s.boss;
  if (!b || b.y < 100) return;
  b.hp = Math.max(s.stage === 0 ? 0 : phaseFloor(s), b.hp - amount);
  b.hit = .06;
}
export function bomb(s) {
  if (s.status !== 'playing' || s.bombs <= 0) return false;
  s.bombs--; clearBarrage(s); s.player.invincible = 2; s.flash = .65; s.shake = .4;
  for (const e of s.enemies) e.hp -= 30;
  hitBoss(s, 70);
  explosion(s, s.player.x, s.player.y, 0xa6f5ff, 70);
  return true;
}
function spawnTutorialWave(s) {
  s.wave++;
  for (let i = 0; i < 3; i++) {
    const kind = s.wave % 3 === 0 ? 'fighter' : 'scout', x = 60 + i * 180;
    s.enemies.push({ id: ++s.id, x, baseX: x, y: -40 - i * 35, age: 0, kind, hp: kind === 'fighter' ? 5 : 3, radius: 16, fire: 1.1 + i * .3, speed: 70, seed: s.wave * 3 + i });
  }
}
function spawnEncounter(s, entry, encounterIndex) {
  const [, formation, attacks] = entry;
  const positions = { pair: [96, 384], arc: [72, 240, 408], left: [84], right: [396], center: [240] }[formation];
  positions.forEach((x, i) => {
    const tank = positions.length === 1;
    s.enemies.push({ id: ++s.id, x, baseX: x, y: -45, age: 0, kind: tank ? 'tank' : i % 2 ? 'fighter' : 'runner',
      hp: (tank ? 26 : 16) + s.stage * 6, radius: tank ? 23 : 16,
      seed: encounterIndex * 3 + i, targetY: 90 + i * 28, attacks, attackIndex: 0,
      variant: encounterIndex + i, hard: s.stage === 2, hold: 4.6 + attacks.length * .8 });
  });
  s.wave++;
}
function updateEnemies(s, dt) {
  const p = s.player;
  for (const e of s.enemies) {
    e.age += dt;
    if (!e.attacks) {
      e.y += e.speed * dt; e.fire -= dt;
      e.x = e.baseX + Math.sin(e.age * 1.6 + e.seed) * 45;
      if (e.fire <= 0 && e.y > 10 && e.y < 550) { aimed(s, e.x, e.y, 1, .22, 120); e.fire = e.kind === 'fighter' ? 1.3 : 2; }
    } else {
      e.x = e.baseX + Math.sin(e.age * 1.1 + e.seed) * 24;
      e.y = e.age < e.hold ? Math.min(e.targetY, -45 + e.age * 125) : e.targetY - (e.age - e.hold) * 150;
      if (e.hp > 0 && e.attackIndex < e.attacks.length && e.age >= 1.25 + e.attackIndex * 2.15 + (e.seed % 3) * .16) {
        queueAttack(s, e.attacks[e.attackIndex], e.x, e.y + 14, e.hard, e.variant + e.attackIndex, .65, e.id);
        e.attackIndex++;
      }
    }
    if (Math.hypot(e.x - p.x, e.y - p.y) < e.radius + PLAYER_RADIUS) { damage(s); e.hp = 0; }
  }
  s.enemies = s.enemies.filter(e => e.y < HEIGHT + 60 && (!e.attacks || e.age < e.hold + 1.5));
}
function spawnBoss(s) {
  const maxHp = BOSS_PHASE_HP[s.stage].reduce((sum, hp) => sum + hp, 0);
  s.boss = { x: 240, y: -80, hp: maxHp, maxHp, age: 0, fire: 1.3, phase: 1, radius: 57, hit: 0,
    phaseTime: 0, eventIndex: 0, cycle: 0, motionTime: 0, attackClock: {} };
  s.bossSpawned = true; s.enemies = []; clearBarrage(s); s.flash = .35;
}
function updateBoss(s, dt) {
  const b = s.boss;
  b.age += dt; b.hit = Math.max(0, b.hit - dt);
  b.y = Math.min(125, b.y + 70 * dt);
  if (s.stage === 0) {
    b.x = WIDTH / 2 + Math.sin(b.age * .8) * 95;
    b.phase = b.hp <= b.maxHp * .5 ? 2 : 1; b.fire -= dt;
    if (b.y >= 100 && b.fire <= 0) {
      if (b.phase === 1) aimed(s, b.x, b.y + 45, 3, .19, 145);
      else {
        for (let i = 0; i < 9; i++) emit(s, b.x, b.y + 25, b.age * .5 + i * Math.PI * 2 / 9, 100, { radius: 4, color: 0xffba72 });
        aimed(s, b.x, b.y + 45, 3, .23, 175);
      }
      b.fire = b.phase === 1 ? .95 : .85;
    }
  } else {
    b.motionTime += dt;
    const destinationX = WIDTH / 2 + Math.sin(b.motionTime * .48) * (s.stage === 2 ? 135 : 100);
    b.x += Math.max(-90 * dt, Math.min(90 * dt, destinationX - b.x));
    if (b.y >= 100) {
      b.phaseTime += dt;
      if (s.stage === 2) updateStage3Boss(s);
      else {
        const score = BOSS_SCORES[s.stage][b.phase - 1];
        const cycleLength = score.at(-1)[0] + 3.5;
        while (b.eventIndex < score.length && b.phaseTime >= score[b.eventIndex][0]) {
          // Mirror emitters and walk through a different gate order on the reprise.
          const index = b.cycle % 2 ? score.length - 1 - b.eventIndex : b.eventIndex;
          const pattern = score[index][1];
          const variant = (b.phase - 1) * 2 + b.eventIndex + b.cycle * 3;
          const originX = pattern === 'sweep' ? (variant % 2 ? 400 : 80) : b.x;
          queueAttack(s, pattern, originX, b.y + 30, s.stage === 2, variant, .65);
          b.eventIndex++;
        }
        if (b.phaseTime >= cycleLength) { b.phaseTime -= cycleLength; b.eventIndex = 0; b.cycle++; }
      }
    }
  }
  if (Math.hypot(b.x - s.player.x, b.y - s.player.y) < b.radius + PLAYER_RADIUS) damage(s);
}
function finishBossPhase(s) {
  const b = s.boss;
  if (!b || s.status !== 'playing') return;
  if (b.hp <= 0) {
    s.score += 2500 * (s.stage + 1); explosion(s, b.x, b.y, STAGES[s.stage].rgb, 100);
    s.boss = null; clearBarrage(s); s.shots = []; s.shake = .7; s.flash = .7;
    if (s.stage === 2) s.status = 'won'; else { s.status = 'transition'; s.transition = 3; }
  } else if (s.stage > 0 && b.hp <= phaseFloor(s)) {
    b.phase++; b.phaseTime = 0; b.eventIndex = 0; b.cycle = 0; b.attackClock = {};
    clearBarrage(s); s.shots = []; explosion(s, b.x, b.y, STAGES[s.stage].rgb, 40);
  }
}
function segmentHits(px, py, x1, y1, x2, y2, radius) {
  // Most bullets are far from the ship. Reject their swept bounds before
  // projecting onto the segment; keep fast bullets and moving-player hits exact.
  if (px < Math.min(x1, x2) - radius || px > Math.max(x1, x2) + radius ||
      py < Math.min(y1, y2) - radius || py > Math.max(y1, y2) + radius) return false;
  const dx = x2 - x1, dy = y2 - y1;
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  const ex = px - x1 - dx * t, ey = py - y1 - dy * t;
  return ex * ex + ey * ey < radius * radius;
}
export function tick(s, dt, input = {}) {
  if (!['playing', 'transition'].includes(s.status)) return;
  dt = clamp(dt, 0, .05);
  s.shake = Math.max(0, s.shake - dt); s.flash = Math.max(0, s.flash - dt);
  for (const p of s.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .98; p.vy *= .98; p.life -= dt; }
  s.particles = s.particles.filter(p => p.life > 0);
  if (s.status === 'transition') {
    s.transition -= dt;
    if (s.transition <= 0) {
      s.stage++; s.time = 0; s.bossSpawned = false; s.status = 'playing'; s.encounter = 0; s.spawnTimer = .6; s.routeClock = {};
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + 1); s.bombs = Math.min(3, s.bombs + 1); s.pickups = [];
    }
    return;
  }
  s.time += dt; s.totalTime += dt;
  const p = s.player, previousX = p.x, previousY = p.y;
  p.invincible = Math.max(0, p.invincible - dt);
  let dx = input.x || 0, dy = input.y || 0;
  const speed = input.focus ? FOCUS_SPEED : MOVE_SPEED;
  if (input.target) { dx = input.target.x - p.x; dy = input.target.y - p.y; }
  const distance = Math.hypot(dx, dy);
  const travel = input.target ? Math.min(distance, speed * dt) : speed * dt;
  const divisor = input.target ? distance || 1 : Math.max(1, distance);
  p.x = clamp(p.x + dx / divisor * travel, 20, WIDTH - 20);
  p.y = clamp(p.y + dy / divisor * travel, 55, HEIGHT - 28);
  s.shotTimer -= dt;
  if ((s.autoFire || input.fire) && s.shotTimer <= 0) {
    s.shotTimer += .14;
    const angles = p.power === 1 ? [0] : p.power === 2 ? [-.055, .055] : [-.11, 0, .11];
    for (const angle of angles) {
      s.shots.push({ id: ++s.id, x: p.x, y: p.y - 20, vx: Math.sin(angle) * 520, vy: -Math.cos(angle) * 520, radius: 4, damage: 2 });
      s.shotsFired++;
    }
  } else if (s.shotTimer < 0) s.shotTimer = 0;
  if (s.time < WAVE_DURATIONS[s.stage]) {
    if (s.stage === 0) {
      s.spawnTimer -= dt;
      if (s.spawnTimer <= 0) { spawnTutorialWave(s); s.spawnTimer += 3; }
    } else if (s.stage === 2) updateStage3Route(s);
    else {
      const encounters = ENCOUNTERS[s.stage];
      while (s.encounter < encounters.length && s.time >= encounters[s.encounter][0]) {
        spawnEncounter(s, encounters[s.encounter], s.encounter); s.encounter++;
      }
    }
  } else if (!s.bossSpawned) spawnBoss(s);
  updateEnemies(s, dt);
  if (s.boss) updateBoss(s, dt);
  updateBarrage(s, dt);
  updateLasers(s, dt);
  for (const shot of s.shots) {
    const oldX = shot.x, oldY = shot.y;
    shot.x += shot.vx * dt; shot.y += shot.vy * dt;
    for (const e of s.enemies) {
      if (e.hp > 0 && segmentHits(e.x, e.y, oldX, oldY, shot.x, shot.y, e.radius + shot.radius)) {
        e.hp -= shot.damage; shot.dead = true; s.hits++; explosion(s, shot.x, shot.y, 0x9eeeff, 3); break;
      }
    }
    if (!shot.dead && s.boss && s.boss.y >= 100 && segmentHits(s.boss.x, s.boss.y, oldX, oldY, shot.x, shot.y, s.boss.radius + shot.radius)) {
      hitBoss(s, shot.damage); shot.dead = true; s.hits++; explosion(s, shot.x, shot.y, 0xffd29c, 2);
    }
  }
  s.shots = s.shots.filter(b => !b.dead && b.y > -25 && b.x > -10 && b.x < WIDTH + 10);
  let remainingBullets = 0;
  for (const b of s.bullets) {
    const oldX = b.x, oldY = b.y;
    b.age = (b.age || 0) + dt;
    if (b.age < (b.wait || 0)) {
      if (!b.dead && b.x > -80 && b.x < WIDTH + 80 && b.y > -140 && b.y < HEIGHT + 60 && b.age < (b.lifetime ?? 14)) s.bullets[remainingBullets++] = b;
      continue;
    }
    if (b.retargetAt && !b.retargeted && b.age >= b.retargetAt) {
      const angle = Math.atan2((b.retargetY ?? p.y) - b.y, (b.retargetX ?? p.x) - b.x);
      b.vx = Math.cos(angle) * b.retargetSpeed; b.vy = Math.sin(angle) * b.retargetSpeed;
      b.retargeted = true;
    }
    if (b.acceleration && b.age >= b.accelerateAfter && b.age <= b.accelerateUntil) {
      const speed = Math.hypot(b.vx, b.vy), factor = (speed + b.acceleration * dt) / speed;
      b.vx *= factor; b.vy *= factor;
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (segmentHits(0, 0, oldX - previousX, oldY - previousY, b.x - p.x, b.y - p.y, b.radius + PLAYER_RADIUS)) { damage(s); b.dead = true; }
    if (!b.dead && b.x > -80 && b.x < WIDTH + 80 && b.y > -140 && b.y < HEIGHT + 60 && b.age < (b.lifetime ?? 14)) {
      s.bullets[remainingBullets++] = b;
    }
  }
  for (const laser of s.lasers) if (laserHits(laser, previousX, previousY, p.x, p.y, PLAYER_RADIUS)) damage(s);
  s.bullets.length = remainingBullets;
  for (const e of s.enemies.filter(e => e.hp <= 0)) {
    s.kills++; s.score += e.kind === 'tank' ? 250 : 100; explosion(s, e.x, e.y, STAGES[s.stage].rgb);
    if (s.kills % 5 === 0) s.pickups.push({ id: ++s.id, x: e.x, y: e.y, kind: s.kills % 15 === 0 ? 'health' : 'power' });
  }
  s.enemies = s.enemies.filter(e => e.hp > 0);
  for (const item of s.pickups) {
    item.y += 70 * dt;
    if (Math.hypot(item.x - p.x, item.y - p.y) < 28) {
      item.dead = true;
      if (item.kind === 'health') p.hp = Math.min(p.maxHp, p.hp + 1); else { p.power = Math.min(3, p.power + 1); s.score += 100; }
      explosion(s, item.x, item.y, 0xaff5cc, 15);
    }
  }
  s.pickups = s.pickups.filter(i => !i.dead && i.y < HEIGHT + 25);
  finishBossPhase(s);
}
export function snapshot(s) {
  return { debug: Boolean(s.debug), checkpoint: s.checkpoint || null, status: s.status, stage: s.stage, time: s.time, totalTime: s.totalTime, hp: s.player.hp, power: s.player.power,
    score: s.score, kills: s.kills, bombs: s.bombs, autoFire: s.autoFire,
    boss: s.boss ? { hp: Math.max(0, s.boss.hp), maxHp: s.boss.maxHp, phase: s.boss.phase, phaseCount: BOSS_PHASE_HP[s.stage].length } : null,
    accuracy: s.shotsFired ? Math.round(s.hits / s.shotsFired * 100) : 0 };
}
