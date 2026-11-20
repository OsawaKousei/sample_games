import { BOSS_PHASE_HP } from './choreography.js';

export const DEBUG_ENTRIES = BOSS_PHASE_HP.flatMap((phases, stage) => [
  { stage, label: `STAGE ${stage + 1}`, path: `/debug/stage/${stage + 1}` },
  ...phases.map((_, i) => ({ stage, bossPhase: i + 1, label: `STAGE ${stage + 1} · BOSS · PHASE ${i + 1}`, path: `/debug/boss/${stage + 1}/phase/${i + 1}` })),
]);
export function parseDebugPath(pathname) {
  if (!/^\/debug(?:\/|$)/.test(pathname)) return null;
  const path = pathname.replace(/\/$/, '');
  const entry = DEBUG_ENTRIES.find(item => item.path === path);
  return entry ? { stage: entry.stage, bossPhase: entry.bossPhase } : { index: true, invalid: path !== '/debug' };
}
