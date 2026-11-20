import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trial, stationaryClear, quantile, CONTROL_PROFILES } from './difficulty.mjs';
import { replaySensitivity, replayRoute } from './replays.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = process.argv[2] ? resolve(process.argv[2]) : resolve(root, 'reports/difficulty.json');
const cases = [
  ...[1, 2, 3].map(bossPhase => ({ stage: 1, bossPhase })),
  ...[1, 2, 3, 4].map(bossPhase => ({ stage: 2, bossPhase })),
];
const sourceFiles = ['src/model.js', 'src/stage3.js', 'src/choreography.js', 'src/patterns.js', 'src/lasers.js',
  'tools/difficulty.mjs', 'tools/replays.mjs', 'tools/measure-difficulty.mjs'];
const fingerprint = createHash('sha256');
for (const file of sourceFiles) fingerprint.update(file).update(readFileSync(resolve(root, file)));
const report = {
  schema: 2, generatedAt: new Date().toISOString(), sourceSha256: fingerprint.digest('hex'), sourceFiles,
  protocol: {
    dt: 1 / 60, observationSeconds: 24, controlProfiles: CONTROL_PROFILES,
    candidateHorizon: '2 * reactionMs + holdMs; includes next reaction interval, when the command is still locked',
    decisionInterval: 'reactionMs + holdMs; standard 500ms, command switches also at least 500ms apart',
    startsX: [120, 240, 360], startsY: 620,
    searchUsesFutureSchedule: true, searchFiring: false, stopAtFirstHit: true,
    note: 'Diagnostic local search, NOT a human model or human clear probability. Trials without a hit are right-censored at 24s, not clears. Zero safe constant actions does not prove unavoidable damage.',
  }, cases: [],
};
for (const entry of cases) {
  const label = `S${entry.stage + 1} P${entry.bossPhase}`;
  process.stderr.write(`${label}...\n`);
  const results = [];
  for (const profile of CONTROL_PROFILES) for (const x of [120, 240, 360]) {
    results.push({ profile: profile.name, ...trial({ ...entry, x, ...profile }) });
  }
  const idle = [120, 240, 360].map(x => trial({ ...entry, x, policy: 'idle' }));
  const stationary = [80, 160, 240, 320, 400].flatMap(x => [500, 620].map(y => stationaryClear({ ...entry, x, y })));
  const summary = CONTROL_PROFILES.map(profile => {
    const subset = results.filter(r => r.profile === profile.name);
    const mean = key => subset.reduce((a, r) => a + r[key], 0) / subset.length;
    return { ...profile, survived: subset.filter(r => r.survived).length, trials: subset.length,
      medianObservedSeconds: quantile(subset.map(r => r.observedSeconds), .5),
      meanSafeOptionFraction: mean('safeOptionFraction'), meanIdleSafeFraction: mean('idleSafeFraction'),
      meanNoConstantActionFraction: mean('noConstantActionFraction'),
      medianClearanceP10: quantile(subset.map(r => r.clearanceP10), .5) };
  });
  report.cases.push({ label, ...entry, results, idle, stationary, summary });
}
report.learnedRoutes = [2, 3].map(bossPhase => ({ bossPhase,
  perturbation: 'Global input-time offset crossed with five start-position offsets; not independent per-command jitter',
  results: replaySensitivity(bossPhase),
  entryMotion: [2, 5, 8, 11].map(motionTime => replayRoute({ bossPhase, motionTime })),
}));
mkdirSync(resolve(output, '..'), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log('| 区間 | 静止射撃で突破 / 10 | 24秒無被弾（反応＋保持150+250 / 200+300 / 300+400ms、各3回） | 標準条件の観測時間中央値 | 安全な固定操作の割合* |');
console.log('| --- | ---: | --- | ---: | ---: |');
for (const c of report.cases) {
  const s = c.summary[1];
  console.log(`| ${c.label} | ${c.stationary.filter(r => r.cleared).length} | ${c.summary.map(r => `${r.survived}/3`).join(' / ')} | ${s.medianObservedSeconds.toFixed(1)}s | ${(s.meanSafeOptionFraction * 100).toFixed(0)}% |`);
}
console.log(`\n* 被弾までの観測区間のみ。操作候補は17通り、標準条件は反応待ち200ms＋保持300ms。人間の成功率ではありません。\nJSON: ${output}`);
for (const route of report.learnedRoutes) {
  const within100 = route.results.filter(r => Math.abs(r.timingOffsetMs) <= 100);
  console.log(`S3 P${route.bossPhase}: 既知経路、時刻±100ms × 開始位置5条件 = ${within100.filter(r => r.survived).length}/${within100.length} 無被弾`);
}
