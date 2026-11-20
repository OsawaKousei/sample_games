import { emit } from './patterns.js';
const TAU = Math.PI * 2;
const PINK = 0xff96ba, BLUE = 0x91e9ff, VIOLET = 0xd6acff, GOLD = 0xffd88c;

function circle(s, x, y, count, rotation, speed, color, options = {}) {
  const radius = options.startRadius || 0;
  for (let i = 0; i < count; i++) {
    const angle = rotation + i * TAU / count;
    emit(s, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, angle, speed, { color, ...options });
  }
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
export function updateStage3Route(s) {
  const c = s.routeClock, t = s.time;
  pulse(s, c, 'frontSpawn', t, .25, 1000, () => {
    spawnEmitter(s, 'front', 80, 0, 7.8, 50); spawnEmitter(s, 'front', 400, 1, 7.8, 50);
  });
  const live = role => s.enemies.filter(e => e.routeRole === role && e.hp > 0);
  if (t < 6) pulse(s, c, 'front', t, 1.3, .27, beat => wavefront(s, beat, live('front')));
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
    // Expand around the ship, then aim at its NEW position. Escape through an
    // ordinary gap before the turn; quarter-turn movement sheds the pursuit.
    // Blue rings keep expanding, as in the Lunatic source. No designated exit.
    pulse(s, c, 'cages', t, .5, 2.4, beat => {
      const x = s.player.x, y = s.player.y;
      const angle = -beat * Math.PI / 2;
      s.cues.push({ pattern: 'cage', x, y, radius: 90, color: PINK, life: .15, maxLife: .15 });
      for (let layer = 0; layer < 3; layer++) {
        const count = 22, radius = 56 + layer * 12;
        for (let i = 0; i < count; i++) {
          const a = angle + (i + .5) * TAU / count;
          emit(s, x + Math.cos(a) * radius, y + Math.sin(a) * radius, a, 30,
            { color: PINK, wait: .15, lifetime: 4.4, retargetAt: 1.6, retargetSpeed: 180 });
        }
      }
      for (let layer = 0; layer < 2; layer++) for (let i = 0; i < 11; i++) {
        const a = angle + (i + .5) * TAU / 11;
        const radius = 54 + layer * 16;
        emit(s, x + Math.cos(a) * radius, y + Math.sin(a) * radius, a, 55,
          { color: BLUE, wait: .15, lifetime: 4.4 });
      }
    });
  } else if (b.phase === 3) {
    // "Modern Divine Spirit World": four corner clusters open in sequence.
    // Enter the space vacated by the first bloom, then relocate for the next
    // sequence. Ordinary rounds, fixed ordering; no random collapse or winders.
    pulse(s, c, 'cornerBloom', t, .5, 6, beat => {
      const corners = [[60, 650], [60, 190], [420, 190], [420, 650]];
      for (let corner = 0; corner < 4; corner++) {
        const [x, y] = corners[corner], order = (corner - beat % 4 + 4) % 4;
        const wait = .65 + order * .45, color = [GOLD, BLUE, PINK, VIOLET][corner];
        s.cues.push({ pattern: 'cage', x, y, radius: 64, color, life: wait, maxLife: wait });
        for (let layer = 0; layer < 3; layer++) {
          circle(s, x, y, 48, Math.PI / 48 + layer * .012 + beat * .07,
            150 + layer * 12, color, { startRadius: 30 + layer * 12, wait, lifetime: 5.7 });
        }
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
