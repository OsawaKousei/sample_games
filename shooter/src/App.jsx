import React, { useEffect, useRef, useState } from 'react';
import { mountGame } from './Game.js';
import { createGame, snapshot, STAGES, WAVE_SECONDS } from './model.js';

const format = n => String(n).padStart(7, '0');
const statusLabels = { ready: '待機中', playing: 'プレイ中', paused: '一時停止', transition: 'クリア', won: 'クリア', lost: '終了' };

export default function App() {
  const host = useRef(null), game = useRef(null), help = useRef(null), resumeAfterHelp = useRef(false);
  const [hud, setHud] = useState(() => snapshot(createGame()));
  const [best, setBest] = useState(() => {
    try { return Number(localStorage.getItem('starfall-best') || 0); } catch { return 0; }
  });
  useEffect(() => {
    game.current = mountGame(host.current, setHud);
    return () => { game.current.destroy(); game.current = null; };
  }, []);
  useEffect(() => {
    if (['won', 'lost'].includes(hud.status) && hud.score > best) {
      setBest(hud.score);
      try { localStorage.setItem('starfall-best', String(hud.score)); } catch { /* Best score is optional. */ }
    }
  }, [hud.status, hud.score, best]);

  const stage = STAGES[hud.stage];
  const progress = hud.boss || ['transition', 'won'].includes(hud.status) ? 100 : Math.min(100, Math.floor(hud.time / WAVE_SECONDS * 100));
  const openHelp = () => {
    resumeAfterHelp.current = ['playing', 'transition'].includes(hud.status);
    if (resumeAfterHelp.current) game.current?.pause();
    game.current?.setInputEnabled(false);
    help.current.showModal();
  };
  const closeHelp = () => {
    game.current?.setInputEnabled(true);
    if (resumeAfterHelp.current) game.current?.pause();
    resumeAfterHelp.current = false;
  };

  return <div className="shooter-app" style={{ '--stage-color': stage.color }}>
    <header className="flight-header">
      <h1>STARFALL</h1>
      <button className="help-button" onClick={openHelp}>操作方法</button>
    </header>
    <main className="flight-layout">
      <section className="game-column" aria-label="ゲーム画面">
        <div className="viewport-label"><h2>{stage.name}</h2><span role="status">{statusLabels[hud.status]}</span></div>
        <div className="game-viewport">
          <div className="phaser-host" ref={host} />
          {hud.boss && <div className="boss-hud">
            <div><span>BOSS</span><span>PHASE {hud.boss.phase}</span></div>
            <div className="meter" role="progressbar" aria-label="ボスの体力" aria-valuenow={Math.round(hud.boss.hp / hud.boss.maxHp * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${hud.boss.hp / hud.boss.maxHp * 100}%` }} /></div>
          </div>}
          {hud.status === 'ready' && <div className="flight-overlay start-overlay">
            <h2>{stage.name}</h2>
            <button className="primary" onClick={() => game.current?.start()}>ゲーム開始</button>
          </div>}
          {hud.status === 'paused' && <div className="flight-overlay">
            <h2>一時停止</h2>
            <button className="primary" onClick={() => game.current?.pause()}>再開する</button>
            <button className="restart-link" onClick={() => game.current?.start()}>最初から</button>
          </div>}
          {hud.status === 'transition' && <div className="flight-overlay transition-overlay">
            <h2>{stage.name}<br />CLEAR</h2>
            <p>シールド +1 · ボム +1</p>
            <span className="stage-next">次は {STAGES[hud.stage + 1]?.name}</span>
          </div>}
          {['won', 'lost'].includes(hud.status) && <div className="flight-overlay result-overlay">
            <h2>{hud.status === 'won' ? '全ステージクリア' : 'ゲームオーバー'}</h2>
            <div className="final-score"><span>スコア</span><strong>{format(hud.score)}</strong></div>
            <div className="result-stats"><div><strong>{hud.kills}</strong><span>撃破数</span></div><div><strong>{hud.accuracy}%</strong><span>命中率</span></div></div>
            <button className="primary" onClick={() => game.current?.start()}>もう一度プレイ</button>
          </div>}
        </div>
        <div className="stage-progress" role="progressbar" aria-label="ステージ進行" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div>
      </section>
      <aside className="flight-right" aria-label="スコアと操作">
        <section className="score-panel" aria-label="スコア">
          <div className="score-label">SCORE</div><strong className="score-number">{format(hud.score)}</strong>
          <div className="best-score"><span>BEST</span><strong>{format(best)}</strong></div>
        </section>
        <ol className="stage-list" aria-label="ステージ">
          {STAGES.map((s, i) => <li key={s.name} className={`${hud.stage === i ? 'current' : ''} ${hud.stage > i || hud.status === 'won' ? 'complete' : ''}`} aria-current={hud.stage === i ? 'step' : undefined}><span>{s.name}</span>{(hud.stage > i || hud.status === 'won') && <span className="stage-check" aria-label="クリア">✓</span>}</li>)}
        </ol>
        <section className="systems-panel" aria-label="機体状態">
          <div className="resource shield-resource">
            <div className="system-label"><span>シールド</span><strong>{hud.hp}<span> / 5</span></strong></div>
            <div className="shield-bars" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <span key={i} className={i < hud.hp ? 'filled' : ''} />)}</div>
          </div>
          <div className="resource power-resource">
            <div className="system-label"><span>火力</span><strong>{hud.power}<span> / 3</span></strong></div>
            <div className="power-bars" aria-hidden="true">{[1, 2, 3].map(i => <span key={i} className={i <= hud.power ? 'filled' : ''} />)}</div>
          </div>
          <div className="resource bomb-resource">
            <div className="system-label"><span>ボム</span><strong>{hud.bombs}<span> / 3</span></strong></div>
            <div className="bombs" aria-hidden="true">{Array.from({ length: 3 }, (_, i) => <span key={i} className={i < hud.bombs ? 'available' : ''} />)}</div>
          </div>
        </section>
        <div className="flight-actions">
          <button className={`auto-toggle ${hud.autoFire ? 'on' : ''}`} aria-pressed={hud.autoFire} onClick={() => game.current?.toggleAuto()}><span>自動射撃</span><strong>{hud.autoFire ? 'ON' : 'OFF'}</strong></button>
          <button className="bomb-button" disabled={hud.status !== 'playing' || !hud.bombs} onClick={() => game.current?.bomb()}><span>ボムを使う</span><kbd>X</kbd></button>
          <button className="pause-flight" disabled={!['playing', 'paused', 'transition'].includes(hud.status)} onClick={() => game.current?.pause()}>{hud.status === 'paused' ? '再開する' : '一時停止'}</button>
        </div>
        <p className="input-hint"><span>WASD / 方向キーで移動</span><span>タッチ：ドラッグで移動</span></p>
      </aside>
    </main>
    <dialog className="help-dialog" ref={help} onClose={closeHelp} aria-labelledby="help-title">
      <div className="help-heading"><h2 id="help-title">操作方法</h2><button aria-label="操作方法を閉じる" onClick={() => help.current.close()}>閉じる</button></div>
      <dl className="control-list">
        <div><dt>移動</dt><dd><kbd>WASD</kbd> / <kbd>↑↓←→</kbd></dd></div>
        <div><dt>ショット</dt><dd><kbd>SPACE</kbd> / <kbd>Z</kbd></dd></div>
        <div><dt>低速移動</dt><dd><kbd>SHIFT</kbd></dd></div>
        <div><dt>ボム</dt><dd><kbd>X</kbd></dd></div>
        <div><dt>一時停止 / 再開</dt><dd><kbd>P</kbd> / <kbd>ESC</kbd></dd></div>
      </dl>
      <p>タッチ操作では、ゲーム画面をドラッグして移動します。自動射撃をONにすると、ショットを撃ち続けます。</p>
      <p>自機中央の白い点が当たり判定です。ボムは敵弾を消し、短時間無敵になります。</p>
    </dialog>
  </div>;
}
