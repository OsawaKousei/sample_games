import React from 'react';
import { DEBUG_ENTRIES } from './debug.js';
export default function DebugMenu({ invalid = false }) {
  return <main className="debug-menu">
    <header><h1>デバッグ</h1><a href="/">ゲームに戻る</a></header>
    {invalid && <p role="alert">開始位置が見つかりません。</p>}
    <p>シールド5・火力3・ボム3で開始します。</p>
    <div className="debug-stages">{[0, 1, 2].map(stage => <section key={stage}>
      <h2>STAGE {stage + 1}</h2>
      {DEBUG_ENTRIES.filter(entry => entry.stage === stage).map(entry => <a key={entry.path} href={entry.path}>{entry.bossPhase ? `BOSS · PHASE ${entry.bossPhase}` : '道中から開始'}</a>)}
    </section>)}</div>
  </main>;
}
