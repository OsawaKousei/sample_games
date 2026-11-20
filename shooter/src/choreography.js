export const WAVE_DURATIONS = [25, 48, 8];

// Time, formation, attack sequence. Each encounter has a different job in the route:
// lure aimed shots, cross the field, thread rows, then reposition for the next wave.
export const ENCOUNTERS = [[], [
  [1, 'pair', ['stream', 'cross']],
  [6, 'arc', ['petals']],
  [11, 'left', ['sweep', 'stream']],
  [16, 'right', ['spiral']],
  [22, 'center', ['gate', 'stream']],
  [29, 'pair', ['bloom', 'cross']],
  [35, 'center', ['weave']],
  [41, 'arc', ['spiral', 'stream']],
], []];

// Each phase has its own authored opening, spacing and spatial requirements.
// Later cycles mirror/reorder the opening rather than replaying one attack forever.
export const BOSS_SCORES = [[], [
  [[.6, 'petals'], [2.7, 'stream'], [4.1, 'spiral'], [6.8, 'cross'], [9.5, 'bloom'], [12.8, 'sweep']],
  [[.6, 'gate'], [2.5, 'stream'], [5.6, 'cross'], [8.4, 'weave'], [11.5, 'petals'], [14.5, 'spiral']],
  [[.6, 'spiral'], [2.7, 'bloom'], [5.1, 'sweep'], [7.8, 'gate'], [10.6, 'cross'], [13.4, 'weave']],
], []];
export const BOSS_PHASE_HP = [[120, 120], [250, 300, 350], [360, 420, 720, 560]];
