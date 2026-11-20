import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { trial, replay, PROTOCOL } from './difficulty.mjs';

const fixture = new URL('./fixtures/learned-route.json', import.meta.url);
if (process.argv.includes('--record')) {
  const recording = trial({ reverse: true, record: true });
  if (recording.status !== 'won') throw new Error('Learned route no longer clears; inspect the balance before replacing the recording.');
  writeFileSync(fixture, JSON.stringify({ seed: recording.seed, protocol: PROTOCOL, actions: recording.actions, choices: recording.choices }, null, 2) + '\n');
}
const seeds = [314159, 42, 2026, 731, 9001];
const results = [];
for (const seed of seeds) {
  for (const config of [{ policy: 'idle' }, { policy: 'circle' }, { policy: 'route' }, { policy: 'route', reverse: true }]) {
    const result = trial({ ...config, seed }); results.push(result);
    process.stderr.write(`${seed} ${result.policy}${result.reverse ? ' reverse' : ''}: ${result.status} ${result.seconds.toFixed(2)}s HP ${result.hp.toFixed(2)}\n`);
  }
}
const builds = ['power', 'mobility', 'guard', ['power', 'guard', 'mobility']].map(build => trial({ reverse: true, build }));
const recording = JSON.parse(readFileSync(fixture, 'utf8'));
const timing = [-6, 0, 6].map(offsetFrames => replay(recording, { offsetFrames }));
const reactiveTiming = [{reactionFrames:6}, {reactionFrames:18}, {commandFrames:24}, {commandFrames:36}].map(config => trial({reverse:true, ...config}));
const sha256 = createHash('sha256');
for (const path of ['../src/model.js', '../src/field.js', './difficulty.mjs']) sha256.update(readFileSync(new URL(path, import.meta.url)));
console.log(JSON.stringify({ sourceSha256: sha256.digest('hex'), protocol: PROTOCOL, seeds, results, builds, timing, reactiveTiming }, null, 2));
