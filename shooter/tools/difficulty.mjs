import { createCheckpoint, tick, PLAYER_RADIUS } from '../src/model.js';
import { laserActive } from '../src/lasers.js';

export const DT = 1 / 60;
// Timing assumptions for sensitivity analysis, not population reaction norms.
export const CONTROL_PROFILES = [
  { name: 'responsive', reactionMs: 150, holdMs: 250 },
  { name: 'standard', reactionMs: 200, holdMs: 300 },
  { name: 'deliberate', reactionMs: 300, holdMs: 400 },
];
export function controlTiming(reactionMs = 200, holdMs = 300) {
  const reactionFrames = Math.round(reactionMs / (DT * 1000));
  const holdFrames = Math.round(holdMs / (DT * 1000));
  if (!Number.isFinite(reactionMs) || !Number.isFinite(holdMs) || reactionMs < 0 || holdMs < 250) {
    throw new RangeError('reactionMs must be nonnegative; holdMs must be at least 250ms');
  }
  return { reactionFrames, holdFrames, blockFrames: reactionFrames + holdFrames };
}
export const ACTIONS = [{ x: 0, y: 0, focus: true }];
for (const focus of [true, false]) for (const [x, y] of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]) {
  ACTIONS.push({ x, y, focus });
}
const cosmeticRandom = () => .5;
export function copyState(s) {
  // The production simulation is reused, including scheduling, retargeting,
  // swept collisions and laser warnings. Never mutate the live trial in a probe.
  const result = structuredClone({ ...s, random: undefined });
  result.random = cosmeticRandom;
  return result;
}
function pointSegmentDistance(x, y, a, b, c, d) {
  const dx = c - a, dy = d - b;
  const t = Math.max(0, Math.min(1, ((x - a) * dx + (y - b) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - a - t * dx, y - b - t * dy);
}
export function clearance(s) {
  const p = s.player;
  let gap = 64;
  for (const b of s.bullets) {
    if (b.age < (b.wait || 0)) continue;
    gap = Math.min(gap, Math.hypot(b.x - p.x, b.y - p.y) - b.radius - PLAYER_RADIUS);
  }
  for (const l of s.lasers) if (laserActive(l)) {
    gap = Math.min(gap, pointSegmentDistance(p.x, p.y, l.x1, l.y1, l.x2, l.y2) - l.width / 2 - PLAYER_RADIUS);
  }
  for (const e of s.enemies) gap = Math.min(gap, Math.hypot(e.x - p.x, e.y - p.y) - e.radius - PLAYER_RADIUS);
  if (s.boss) gap = Math.min(gap, Math.hypot(s.boss.x - p.x, s.boss.y - p.y) - s.boss.radius - PLAYER_RADIUS);
  return gap;
}
export function probe(s, action, previousAction, delayFrames, horizonFrames = 36) {
  const copy = copyState(s), hp = copy.player.hp;
  let minimumGap = 64;
  for (let i = 0; i < horizonFrames; i++) {
    tick(copy, DT, i < delayFrames ? previousAction : action);
    if (copy.player.hp < hp || copy.status === 'lost') return { safe: false, hitAt: (i + 1) * DT, minimumGap: 0, state: copy };
    // Clearance is descriptive only; real tick() decides collisions every frame.
    if (i % 3 === 0) minimumGap = Math.min(minimumGap, clearance(copy));
  }
  return { safe: true, hitAt: horizonFrames * DT, minimumGap, state: copy };
}
export function chooseAction(s, previousAction, delayFrames, horizonFrames = 36) {
  const probes = ACTIONS.map(action => probe(s, action, previousAction, delayFrames, horizonFrames));
  let selected = 0, best = -Infinity;
  for (let i = 0; i < probes.length; i++) {
    const r = probes[i], p = r.state.player;
    // Prefer surviving, then clearance, then a lower central shooting position.
    // A fixed policy is used for every phase; no phase-specific escape rules.
    const score = (r.safe ? 10000 : r.hitAt * 1000) + Math.min(24, r.minimumGap)
      - Math.abs(p.x - (s.boss?.x ?? 240)) * .025 - Math.abs(p.y - 600) * .05
      - (i ? .8 : 0) - (ACTIONS[i].focus ? 0 : .6);
    if (score > best) { best = score; selected = i; }
  }
  return { action: ACTIONS[selected], safeOptions: probes.filter(r => r.safe).length,
    idleSafe: probes[0].safe, chosenGap: probes[selected].minimumGap };
}
export function quantile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}
export function trial({ stage, bossPhase, x = 240, seconds = 24, reactionMs = 200, holdMs = 300, policy = 'search' }) {
  const s = createCheckpoint({ stage, bossPhase }, cosmeticRandom);
  s.status = 'playing'; s.autoFire = false; s.player.x = x;
  let previousAction = ACTIONS[0], pendingAction = ACTIONS[0], currentAction = ACTIONS[0];
  let safeSum = 0, idleSafe = 0, noOption = 0, decisions = 0, movingFrames = 0;
  const gaps = [], timeline = [], inputs = [];
  const { reactionFrames, holdFrames, blockFrames } = controlTiming(reactionMs, holdMs);
  const frames = Math.round(seconds / DT), cadence = blockFrames;
  for (let frame = 0; frame < frames; frame++) {
    if (policy === 'search' && frame % cadence === 0) {
      previousAction = currentAction;
      // Every candidate includes the same immutable reaction interval, then
      // a whole held command. No sub-frame/path steering inside either block.
      // The command also remains locked during the NEXT reaction interval;
      // include that committed tail instead of understating its collision risk.
      const result = chooseAction(s, previousAction, reactionFrames, blockFrames + reactionFrames);
      pendingAction = result.action;
      safeSum += result.safeOptions; idleSafe += Number(result.idleSafe);
      noOption += Number(result.safeOptions === 0); decisions++;
      timeline.push({ time: frame * DT, applyTime: (frame + reactionFrames) * DT,
        action: pendingAction, safeOptions: result.safeOptions, idleSafe: result.idleSafe });
    }
    if (frame % cadence === reactionFrames) currentAction = pendingAction;
    if (!inputs.length || Object.keys(currentAction).some(key => inputs.at(-1).action[key] !== currentAction[key])) {
      inputs.push({ time: frame * DT, action: currentAction });
    }
    if (currentAction.x || currentAction.y) movingFrames++;
    tick(s, DT, currentAction);
    if (s.player.hp < 5) return finish(frame + 1, false);
    if (frame % 6 === 0) gaps.push(clearance(s));
  }
  return finish(frames, true);
  function finish(observedFrames, survived) {
    return { x, reactionMs: reactionFrames * DT * 1000, holdMs: holdFrames * DT * 1000,
      decisionIntervalMs: blockFrames * DT * 1000, policy, survived,
      observedSeconds: observedFrames * DT, firstHitSeconds: survived ? null : observedFrames * DT,
      safeOptionFraction: decisions ? safeSum / (decisions * ACTIONS.length) : null,
      idleSafeFraction: decisions ? idleSafe / decisions : null,
      noConstantActionFraction: decisions ? noOption / decisions : null,
      clearanceP10: quantile(gaps, .1), movingFraction: movingFrames / observedFrames,
      timeline, inputs };
  }
}

// A separate, cheap end-to-end check: shooting is enabled, normal HP/iframes,
// no bombs. This catches phases that can be beaten without moving at all.
export function stationaryClear({ stage, bossPhase, x, y = 620, seconds = 60 }) {
  const s = createCheckpoint({ stage, bossPhase }, cosmeticRandom);
  s.status = 'playing'; s.player.x = x; s.player.y = y;
  let hits = 0, firstHit = null;
  for (let frame = 0; frame < seconds / DT; frame++) {
    const hp = s.player.hp;
    tick(s, DT);
    if (s.player.hp < hp) { hits++; firstHit ??= (frame + 1) * DT; }
    if (!s.boss || s.boss.phase !== bossPhase) return { x, y, cleared: true, hits, firstHit, seconds: (frame + 1) * DT };
    if (s.status === 'lost') return { x, y, cleared: false, hits, firstHit, seconds: (frame + 1) * DT };
  }
  return { x, y, cleared: false, hits, firstHit, seconds, timeout: true };
}
