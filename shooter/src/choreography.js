export const WAVE_DURATIONS = [25, 48, 66];

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
], [
  [.6, 'pair', ['spiral']],
  [5.5, 'left', ['stream', 'sweep']],
  [10.5, 'right', ['petals', 'cross']],
  [16, 'center', ['gate', 'stream']],
  [22, 'pair', ['bloom']],
  [27, 'center', ['weave', 'stream']],
  [33, 'arc', ['cross', 'petals']],
  [39, 'left', ['sweep', 'spiral']],
  [45, 'center', ['gate', 'bloom']],
  [52, 'right', ['weave', 'stream']],
  [59, 'pair', ['spiral', 'cross']],
]];

// Each phase has its own authored opening, spacing and spatial requirements.
// Later cycles mirror/reorder the opening rather than replaying one attack forever.
export const BOSS_SCORES = [[], [
  [[.6, 'petals'], [2.7, 'stream'], [4.1, 'spiral'], [6.8, 'cross'], [9.5, 'bloom'], [12.8, 'sweep']],
  [[.6, 'gate'], [2.5, 'stream'], [5.6, 'cross'], [8.4, 'weave'], [11.5, 'petals'], [14.5, 'spiral']],
  [[.6, 'spiral'], [2.7, 'bloom'], [5.1, 'sweep'], [7.8, 'gate'], [10.6, 'cross'], [13.4, 'weave']],
], [
  [[.65, 'spiral'], [2.3, 'petals'], [4.6, 'stream'], [6.3, 'cross'], [8.8, 'bloom'], [11.5, 'sweep'], [14.5, 'gate']],
  [[.65, 'gate'], [2.6, 'stream'], [5.4, 'weave'], [8.5, 'cross'], [10.8, 'petals'], [13.6, 'gate'], [16.3, 'sweep']],
  [[.65, 'bloom'], [2.8, 'spiral'], [5.5, 'sweep'], [7.8, 'stream'], [9.7, 'weave'], [12.7, 'petals'], [15.3, 'cross']],
  [[.65, 'gate'], [1.6, 'stream'], [3.1, 'spiral'], [4.4, 'bloom'], [6.2, 'weave'], [7.8, 'cross'], [9.5, 'sweep'], [11.2, 'petals'], [13.2, 'gate'], [14.4, 'stream'], [16.2, 'bloom'], [17.5, 'spiral']],
]];
export const BOSS_PHASE_HP = [[120, 120], [250, 300, 350], [400, 450, 500, 550]];
