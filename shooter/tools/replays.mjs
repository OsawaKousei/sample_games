import { createCheckpoint, tick } from '../src/model.js';
import { DT } from './difficulty.mjs';

// Learned examples, not reactive agents. Only held keyboard commands; no
// coordinates interpolated per frame, bullet clearing, shots, bombs or immunity.
export function learnedRoute(bossPhase) {
  const idle = { time: 0, x: 0, y: 0, focus: true };
  if (bossPhase === 2) {
    const commands = [idle];
    for (let n = 0; n < 17; n++) {
      const [x, y] = [[1, 0], [0, -1], [-1, 0], [0, 1]][n % 4];
      // React to the first ring after 200ms, then anticipate the learned beat.
      const time = n === 0 ? .7 : .4 + n * 2.4;
      commands.push({ time, x, y, focus: false }, { time: time + .4, x, y, focus: true });
    }
    return { x: 78, y: 620, seconds: 40, commands };
  }
  if (bossPhase !== 3) throw new RangeError('No learned route for this phase');
  const actions = [[0, 0, true], [-1, 0, true], [1, 0, true], [0, -1, true], [0, 1, true],
    [-1, -1, true], [1, -1, true], [-1, 1, true], [1, 1, true], [-1, 0, false], [1, 0, false]];
  // 500ms control blocks, found offline with a 16px planning margin, then
  // replayed through production tick() and checked with timing/position errors.
  const route = [0,0,1,10,8,0,0,0,0,0,0,0,0,0,0,9,9,6,0,0,1,0,0,0,0,0,0,8,3,8,1,0,
    0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
  const commands = route.flatMap((action, i) => {
    if (i && route[i - 1] === action) return [];
    const [x, y, focus] = actions[action];
    return [{ time: i ? i * .5 - .05 : 0, x, y, focus }];
  });
  return { x: 240, y: 620, seconds: 32, commands };
}

export function replayRoute({ bossPhase, timingOffsetMs = 0, dx = 0, dy = 0, motionTime = 0 }) {
  const route = learnedRoute(bossPhase);
  const s = createCheckpoint({ stage: 2, bossPhase }, () => .5);
  s.status = 'playing'; s.autoFire = false;
  s.player.x = route.x + dx; s.player.y = route.y + dy;
  s.boss.motionTime = motionTime;
  // A preceding phase can leave the boss anywhere on its normal movement arc.
  s.boss.x = 240 + Math.sin(motionTime * .48) * 135;
  let input = route.commands[0], command = 1;
  const changes = [];
  for (let frame = 0; frame < route.seconds / DT; frame++) {
    while (command < route.commands.length && frame * DT + 1e-8 >= route.commands[command].time + timingOffsetMs / 1000) {
      input = route.commands[command++]; changes.push(frame * DT);
    }
    tick(s, DT, input);
    if (s.player.hp < 5) return finish(false, (frame + 1) * DT);
  }
  return finish(true, route.seconds);
  function finish(survived, seconds) {
    return { bossPhase, timingOffsetMs, dx, dy, motionTime, survived, observedSeconds: seconds,
      inputChanges: changes.length, minimumHoldMs: Math.min(...changes.slice(1).map((time, i) => (time - changes[i]) * 1000)) };
  }
}

export function replaySensitivity(bossPhase) {
  return [-200, -100, -50, 0, 50, 100, 200].flatMap(timingOffsetMs =>
    [[0, 0], [-4, 0], [4, 0], [0, -4], [0, 4]].map(([dx, dy]) =>
      replayRoute({ bossPhase, timingOffsetMs, dx, dy })));
}
