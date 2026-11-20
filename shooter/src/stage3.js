import { emit } from './patterns.js';
import { addLaser } from './lasers.js';
const TAU = Math.PI * 2;
const PINK = 0xff96ba, BLUE = 0x91e9ff, VIOLET = 0xd6acff, GOLD = 0xffd88c;

function circle(s, x, y, count, rotation, speed, color, options = {}) {
  const radius = options.startRadius || 0;
  for (let i = 0; i < count; i++) {
    const angle = rotation + i * TAU / count;
    emit(s, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, angle, speed, { color, ...options });
  }
}
function aim(s, x, y, count, speed, spread = .055) {
  const angle = Math.atan2(s.player.y - y, s.player.x - x);
  for (let i = 0; i < count; i++) emit(s, x, y, angle + (i - (count - 1) / 2) * spread, speed, { color: GOLD });
}
function pulse(s, clock, key, time, start, interval, action) {
  clock[key] ??= 0;
  while (time + 1e-8 >= start + clock[key] * interval) action(clock[key]++);
}
function spawnEmitter(s, role, x, seed, hold, hp) {
  s.enemies.push({ id: ++s.id, x, baseX: x, y: -45, age: 0, kind: 'tank', hp, radius: 21,
    seed, targetY: 88, attacks: [], attackIndex: 0, hold, routeRole: role });
}
function wavefront(s, beat, sources) {
  // Two interlaced, corrugated fronts; each contains two moving, offset seams.
  const slit = 115 + 45 * Math.sin(beat * .26);
  for (let i = 0; i < 40; i++) {
    const x = 6 + i * 12, vx = 32 * Math.sin(i * .35 + beat * .23);
    if (!sources.some(e => x < 240 ? e.baseX < 240 : e.baseX > 240)) continue;
    const projectedX = x + vx * 3.3;
    if (Math.abs(projectedX - slit) < 24 || Math.abs(projectedX - (480 - slit)) < 24) continue;
    const y = -36 + 30 * Math.sin(i * .35 + beat * .23);
    emit(s, x, y, Math.atan2(182, vx), Math.hypot(vx, 182), { color: beat % 2 ? BLUE : PINK });
  }
}
function sideComb(s, beat) {
  const left = beat % 2 === 0, opening = 490 + 80 * Math.sin(beat * .65);
  for (let y = 220; y <= 700; y += 14) {
    if (Math.abs(y - opening) < 30) continue;
    emit(s, left ? -10 : 490, y, left ? 0 : Math.PI, 155 + beat % 3 * 8, { color: left ? VIOLET : GOLD });
  }
}
export function updateStage3Route(s) {
  const c = s.routeClock, t = s.time;
  pulse(s, c, 'frontSpawn', t, .25, 1000, () => {
    spawnEmitter(s, 'front', 80, 0, 7.8, 50); spawnEmitter(s, 'front', 400, 1, 7.8, 50);
  });
  const live = role => s.enemies.filter(e => e.routeRole === role && e.hp > 0);
  if (t < 8) pulse(s, c, 'front', t, 1.3, .27, beat => wavefront(s, beat, live('front')));
  if (t >= 8 && t < 22) {
    pulse(s, c, 'aimSpawn', t, 8, 6.5, beat => {
      spawnEmitter(s, 'aim', 50, beat * 2 + 2, 7, 34); spawnEmitter(s, 'aim', 430, beat * 2 + 3, 7, 34);
    });
    pulse(s, c, 'laser', t, 8.2, 2.4, beat => {
      const offset = [0, 32, 16, 48][beat % 4];
      for (let x = 40 + offset; x < 470; x += 64) {
        addLaser(s, x, 24, x, 730, { color: beat % 2 ? PINK : BLUE, width: 12, warning: .7, duration: 1.7 });
      }
    });
    pulse(s, c, 'aimLaser', t, 9.35, 2.4, beat => {
      // Lock the old position during the vertical partition. Bait both beams
      // toward an edge of the compartment, then sidestep before they fire.
      for (const x of [40, 440]) {
        const angle = Math.atan2(s.player.y - 110, s.player.x - x);
        addLaser(s, x, 110, x + Math.cos(angle) * 1000, 110 + Math.sin(angle) * 1000,
          { color: beat % 2 ? GOLD : VIOLET, width: 10, warning: .8, duration: .65 });
      }
    });
    pulse(s, c, 'aim', t, 8.5, .28, beat => {
      // Each burst locks a fresh position. Stream within a compartment, then
      // reverse across the former laser line during the scheduled release.
      const sources = live('aim');
      const source = sources[beat % Math.max(1, sources.length)];
      if (source && source.y >= 60) aim(s, source.x, source.y + 20, 7, 275, .04);
    });
  }
  if (t >= 22 && t < 30) {
    pulse(s, c, 'combSpawn', t, 22, 1000, () => {
      spawnEmitter(s, 'comb', 45, 8, 8, 46); spawnEmitter(s, 'comb', 435, 9, 8, 46);
    });
    pulse(s, c, 'comb', t, 23.2, .38, beat => {
      if (live('comb').some(e => beat % 2 === 0 ? e.baseX < 240 : e.baseX > 240)) sideComb(s, beat);
    });
    pulse(s, c, 'exitAim', t, 23.3, 1.15, beat => {
      const sources = live('comb'), source = sources[beat % Math.max(1, sources.length)];
      if (source) aim(s, source.x, source.y + 20, 7, 210);
    });
  }
}

// Four ordinary-round-bullet homages. Source notes and adaptations are in
// docs/stage3-patterns.md. These deliberately do not use Stage 2's attack library.
export function updateStage3Boss(s) {
  const b = s.boss, t = b.phaseTime, c = b.attackClock;
  if (b.phase === 1) {
    // "Trembling Shivering Star": seven aligned rings whose alternating half
    // steps close the preceding gaps. Read the rhythm, then move with the stack.
    pulse(s, c, 'rings', t, .4, .17, beat => {
      const group = Math.floor(beat / 7), row = beat % 7;
      if (row === 6) return; // a visible seam gives room to reverse direction
      const angle = group * .173 + (row % 2) * Math.PI / 90;
      circle(s, b.x, b.y + 26, 90, angle, 143 + (row % 2) * 7, row % 2 ? BLUE : PINK);
    });
  } else if (b.phase === 2) {
    // "Refinement of Earthly Impurity": escape a growing ring around the old
    // player position before its ordinary bullets turn toward the new position.
    pulse(s, c, 'cages', t, .5, 2.7, beat => {
      const x = s.player.x, y = s.player.y, angle = .12 + beat * Math.PI / 8;
      s.cues.push({ pattern: 'cage', x, y, radius: 100, color: VIOLET, life: .25, maxLife: .25 });
      for (let layer = 0; layer < 3; layer++) {
        const count = 28 + layer * 8, radius = 84 + layer * 30;
        for (let i = 0; i < count; i++) {
          const a = angle + i * TAU / count;
          emit(s, x + Math.cos(a) * radius, y + Math.sin(a) * radius, a, 32 + layer * 8,
            { color: layer % 2 ? BLUE : VIOLET, wait: .25,
              retargetAt: 1.55 + layer * .17, retargetSpeed: 165 + layer * 20 });
        }
      }
    });
    pulse(s, c, 'cagePressure', t, 1.1, .8, beat => circle(s, b.x, b.y + 26, 36, beat * .13, 130, PINK));
  } else if (b.phase === 3) {
    // "Oumagatoki": dense four-armed winders change rotation at explicit seams.
    // Follow the broad opening, then reverse; this is a traversal phase.
    pulse(s, c, 'winder', t, .35, .12, beat => {
      const local = beat % 72, direction = local < 36 ? 1 : -1;
      const sweep = (local < 36 ? local : 71 - local) * .034;
      if (local === 35 || local === 36) return;
      for (let arm = 0; arm < 4; arm++) for (let row = -4; row <= 4; row++) {
        emit(s, b.x, b.y + 28, arm * TAU / 4 + sweep + row * .026 + .3, 155,
          { color: direction > 0 ? GOLD : VIOLET });
      }
    });
  } else {
    // "Pristine Danmaku Hell": red centre rings, then staggered purple side
    // fans, fast blue side rings, and a final fixed lattice. Escalates by both
    // damage and time, so camping outside the firing lane does not stall it.
    const remaining = b.hp / 560;
    const level = Math.min(3, Math.max(Math.floor(t / 5), Math.floor((1 - remaining) * 4)));
    b.intensity = level;
    pulse(s, c, 'red', t, .35, .25, beat => {
      const x = b.x + Math.sin(beat * 1.73) * 70;
      circle(s, x, b.y + 22, 36, beat * .143, 124, PINK);
    });
    if (level >= 1) {
      c.purpleStart ??= t;
      pulse(s, c, 'purple', t, c.purpleStart, .48, beat => {
        for (const side of [-1, 1]) for (let i = 0; i < 9; i++) {
          const a = .38 + i * .17 + Math.sin(beat * 1.4) * .1;
          emit(s, side < 0 ? 38 : 442, 155 + beat % 3 * 35, side < 0 ? a : Math.PI - a, 146, { color: VIOLET });
        }
      });
    }
    if (level >= 2) {
      c.blueStart ??= t;
      pulse(s, c, 'blue', t, c.blueStart, .95, beat => {
        const side = beat % 2 ? -1 : 1;
        circle(s, side < 0 ? 50 : 430, 180 + (beat % 3) * 50, 48, beat * .21, 225, BLUE);
      });
    }
    if (level >= 3) {
      c.goldStart ??= t;
      pulse(s, c, 'gold', t, c.goldStart, .8, beat => {
        circle(s, b.x, b.y + 22, 24, Math.PI / 24 + beat * .013, 173, GOLD);
      });
    }
  }
}
