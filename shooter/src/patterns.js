// Every attack uses the same round projectile. Shape comes from placement,
// timing and motion; gameplay never consumes the cosmetic random generator.
export const DANMAKU_COLORS = [0xff96ba, 0x91e9ff, 0xd6acff, 0xffd88c];
const TAU = Math.PI * 2;

export function emit(s, x, y, angle, speed, options = {}) {
  s.bullets.push({ id: ++s.id, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    radius: 3.5, color: DANMAKU_COLORS[0], age: 0, ...options });
}

function ring(s, event, offset, speed, petals = 0) {
  const count = event.hard ? 72 : 36;
  for (let i = 0; i < count; i++) {
    const angle = i * TAU / count + offset;
    emit(s, event.x, event.y, angle, speed * (1 + petals * Math.cos(angle * 5 + event.variant)), { color: event.color });
  }
}

export function queueAttack(s, pattern, x, y, hard = false, variant = 0, delay = .65, ownerId = null) {
  const event = { pattern, x, y, hard, variant, ownerId, targetX: s.player.x, targetY: s.player.y,
    color: DANMAKU_COLORS[variant % DANMAKU_COLORS.length] };
  const count = { stream: 5, petals: hard ? 4 : 3, spiral: hard ? 12 : 9, cross: 6, gate: 6, sweep: 12, bloom: hard ? 3 : 2, weave: 7 }[pattern] || 1;
  const spacing = { stream: .12, petals: .27, spiral: .13, cross: .24, gate: .34, sweep: .14, bloom: .5, weave: .3 }[pattern] || 0;
  const gapX = [96, 372, 164, 312, 240, 116, 348][variant % 7];
  const warning = { ...event, gapX, life: delay, maxLife: delay };
  if (pattern === 'cross') {
    s.cues.push({ ...warning, x: 48, y: y + 24 }, { ...warning, x: 432, y: y + 24 });
  } else s.cues.push(warning);
  for (let i = 0; i < count; i++) s.salvos.push({ ...event, gapX, at: s.totalTime + delay + i * spacing, beat: i });
}

export function fireSalvo(s, e) {
  const { x, y, hard, variant, beat } = e;
  const color = e.color;
  const aim = Math.atan2(e.targetY - y, e.targetX - x);
  if (e.pattern === 'stream') {
    // Lock the whole burst at its warning: lure it, then leave the line.
    for (let i = -1; i <= 1; i++) emit(s, x, y, aim + i * (hard ? .075 : .13), hard ? 245 : 190, { color });
  } else if (e.pattern === 'petals') {
    ring(s, e, variant * .19 + beat * .065, (hard ? 130 : 106) + beat * 10, .27);
  } else if (e.pattern === 'spiral') {
    for (const side of [-1, 1]) {
      for (let arm = 0; arm < (hard ? 7 : 5); arm++) {
        const angle = arm * TAU / (hard ? 7 : 5) + side * (beat * .18 + variant * .27);
        emit(s, x + side * 30, y, angle, hard ? 158 : 125, { color: side < 0 ? color : DANMAKU_COLORS[(variant + 1) % 4] });
      }
    }
  } else if (e.pattern === 'cross') {
    const side = beat % 2 ? -1 : 1;
    const originX = side < 0 ? 48 : 432;
    for (let i = 0; i < (hard ? 12 : 8); i++) {
      const a = .48 + i * (hard ? .115 : .17) + Math.floor(beat / 2) * .045;
      emit(s, originX, y + 24, side < 0 ? a : Math.PI - a, hard ? 205 : 158, { color: DANMAKU_COLORS[(variant + beat % 2) % 4] });
    }
  } else if (e.pattern === 'gate') {
    const direction = variant % 2 ? -1 : 1;
    const gapX = e.gapX + direction * beat * (hard ? 9 : 7);
    const halfGap = hard ? 26 : 44;
    for (let bx = 8; bx <= 472; bx += hard ? 14 : 18) {
      if (Math.abs(bx - gapX) < halfGap) continue;
      emit(s, bx, -12, Math.PI / 2, hard ? 245 : 190, { color });
    }
  } else if (e.pattern === 'sweep') {
    const reverse = variant % 2 === 0;
    const angle = .35 + (reverse ? beat : 11 - beat) * .2;
    for (let i = 0; i < (hard ? 5 : 3); i++) emit(s, x, y, angle + (i - (hard ? 2 : 1)) * .052, hard ? 215 : 165, { color });
  } else if (e.pattern === 'bloom') {
    const count = hard ? 64 : 40;
    for (let i = 0; i < count; i++) {
      const angle = i * TAU / count + beat * TAU / count / 2 + variant * .11;
      emit(s, x, y, angle, 54 + 18 * Math.cos(angle * 4), { color, acceleration: hard ? 135 : 85, accelerateAfter: .8, accelerateUntil: 1.9 });
    }
  } else if (e.pattern === 'weave') {
    // Alternating, slanted rows form moving diamonds rather than random rain.
    const direction = beat % 2 ? -1 : 1;
    for (let bx = -40; bx < 530; bx += hard ? 29 : 42) {
      emit(s, bx + (beat % 2 ? 14 : 0), -12, Math.PI / 2 + direction * .24, hard ? 190 : 145, { color: DANMAKU_COLORS[(variant + beat % 2) % 4] });
    }
  }
}

export function updateBarrage(s, dt) {
  for (const cue of s.cues) cue.life -= dt;
  const active = event => !event.ownerId || s.enemies.some(enemy => enemy.id === event.ownerId && enemy.hp > 0);
  s.cues = s.cues.filter(cue => cue.life > 0 && active(cue));
  const due = s.salvos.filter(e => e.at <= s.totalTime + 1e-8);
  s.salvos = s.salvos.filter(e => e.at > s.totalTime + 1e-8);
  for (const e of due) if (active(e)) fireSalvo(s, e);
}
