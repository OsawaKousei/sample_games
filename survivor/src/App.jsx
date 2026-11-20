import React, { useEffect, useRef, useState } from 'react';
import { World } from './World.js';
import { createRun, snapshot, PHASES, TOTAL_SECONDS, UPGRADES } from './model.js';

const clock = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
const statusLabels = { ready: '開始前', playing: 'プレイ中', paused: '一時停止', upgrade: '強化選択', won: 'クリア', lost: 'ゲームオーバー' };
function Meter({ label, value, max, className = '' }) {
  return <div className={`meter ${className}`} role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max}><span style={{ width: `${Math.min(100, Math.max(0, value / max * 100))}%` }} /></div>;
}
export default function App() {
  const container = useRef(null), world = useRef(null), help = useRef(null), upgrades = useRef(null), resumeAfterHelp = useRef(false);
  const [hud, setHud] = useState(() => snapshot(createRun())), [error, setError] = useState('');
  const [best, setBest] = useState(() => { try { return Number(localStorage.getItem('wildbloom-best') || 0); } catch { return 0; } });
  useEffect(() => {
    let game;
    try { game = new World(container.current, setHud, setError); world.current = game; }
    catch { setError('3D描画を開始できません。WebGL 2対応のブラウザで、ハードウェアアクセラレーションを有効にしてください。'); }
    return () => { game?.dispose(); world.current = null; };
  }, []);
  useEffect(() => {
    if (['won', 'lost'].includes(hud.status) && hud.kills > best) {
      setBest(hud.kills); try { localStorage.setItem('wildbloom-best', String(hud.kills)); } catch { /* Storage is optional. */ }
    }
  }, [hud.status, hud.kills, best]);
  useEffect(() => {
    const dialog = upgrades.current;
    if (hud.status === 'upgrade') {
      if (!dialog.open) dialog.showModal();
      if (!dialog.contains(document.activeElement) || document.activeElement.disabled) {
        dialog.querySelector('button:not(:disabled)')?.focus();
      }
    } else if (dialog.open) dialog.close();
  }, [hud.status, hud.pendingUpgrades]);
  const active = hud.status === 'playing', phase = PHASES[hud.phase];
  const counts = hud.build.reduce((all, id) => ({ ...all, [id]: (all[id] || 0) + 1 }), {});
  function openHelp() {
    resumeAfterHelp.current = world.current?.state.status === 'playing';
    if (resumeAfterHelp.current) world.current.pause();
    help.current.showModal();
  }
  function closeHelp() {
    if (resumeAfterHelp.current && world.current?.state.status === 'paused') world.current.pause();
    resumeAfterHelp.current = false;
  }
  function joystick(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left - r.width / 2) / (r.width * .35), z = (e.clientY - r.top - r.height / 2) / (r.height * .35);
    const d = Math.max(1, Math.hypot(x, z));
    if (world.current) world.current.touch = { ...world.current.touch, x: x / d, z: z / d };
  }
  function stopMove() { if (world.current) Object.assign(world.current.touch, { x: 0, z: 0 }); }
  function navigateUpgrades(e) {
    if (e.key === 'Enter' && e.repeat) { e.preventDefault(); return; }
    const direction = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (!direction) return;
    e.preventDefault();
    e.stopPropagation();
    const choices = [...upgrades.current.querySelectorAll('button:not(:disabled)')];
    if (!choices.length) return;
    const current = choices.indexOf(document.activeElement);
    choices[(current + direction + choices.length) % choices.length].focus();
  }
  return <div className={`survivor-app ${hud.hurt > 0 ? 'is-hurt' : ''}`}>
    <header className="survivor-header">
      <h1>WILDBLOOM</h1>
      <div className="header-actions">
        <button onClick={openHelp}>操作方法</button>
        <button className="pause-button" disabled={!['playing', 'paused'].includes(hud.status)} onClick={() => world.current?.pause()}>{hud.status === 'paused' ? '再開する' : '一時停止'}</button>
      </div>
    </header>
    <main className="survivor-layout">
      <section className="run-hud" aria-label="プレイ状況">
        <div className="health-stat"><div className="stat-label"><span>体力</span><strong>{Math.ceil(hud.hp)} <small>/ {hud.maxHp}</small></strong></div><Meter label="体力" value={hud.hp} max={hud.maxHp} className="health" /></div>
        <div className="xp-stat"><div className="stat-label"><span>レベル {hud.level}</span><strong>{hud.xp} <small>/ {hud.nextXp}</small></strong></div><Meter label="経験値" value={hud.xp} max={hud.nextXp} className="experience" /></div>
        <div className="time-stat"><span>残り時間</span><strong className="survival-time">{clock(Math.ceil(TOTAL_SECONDS - hud.time))}</strong></div>
        <div className="kill-stat"><span>撃破数</span><strong>{hud.kills}</strong></div>
        <div className="phase-stat"><strong style={{ color: phase.color }}>{phase.name}</strong><span>{statusLabels[hud.status]}</span></div>
      </section>
      <section className="world-shell" aria-label="ゲーム画面">
        <div className="world-canvas" ref={container} /><div className="world-vignette" />
        {active && <div className="touch-controls">
          <div className="joystick" aria-label="タッチ移動" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); joystick(e); }} onPointerMove={e => { if (e.buttons) joystick(e); }} onPointerUp={stopMove} onPointerCancel={stopMove}><span>移動</span></div>
          <button className="touch-dash" aria-label="回避する" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); if (world.current) world.current.touch.dash = true; }} onPointerUp={() => { if (world.current) world.current.touch.dash = false; }} onPointerCancel={() => { if (world.current) world.current.touch.dash = false; }}>回避</button>
        </div>}
        {hud.status === 'ready' && !error && <div className="run-overlay intro-layer"><section className="run-card">
          <h2>WILDBLOOM</h2><p>2分15秒生存するとクリア。<br />フィールドの結晶を拾って、<br />ステータスを強化できます。</p>
          <button className="primary" onClick={() => world.current?.start()}>ゲーム開始</button>
          <span className="best-record">自己ベスト {best} 体</span>
        </section></div>}
        {hud.status === 'paused' && !error && <div className="run-overlay"><section className="run-card" role="dialog" aria-modal="true" aria-label="一時停止">
          <h2>一時停止</h2><div className="run-buttons"><button className="primary" onClick={() => world.current?.pause()}>再開する</button><button onClick={() => world.current?.start()}>最初から</button></div>
        </section></div>}
        {['won', 'lost'].includes(hud.status) && !error && <div className="run-overlay"><section className="run-card result-card" role="dialog" aria-modal="true" aria-label="結果">
          <h2>{statusLabels[hud.status]}</h2>
          <dl className="run-results"><div><dt>生存時間</dt><dd>{clock(hud.time)}</dd></div><div><dt>撃破数</dt><dd>{hud.kills}</dd></div><div><dt>強化数</dt><dd>{hud.build.length}</dd></div></dl>
          <button className="primary" onClick={() => world.current?.start()}>もう一度プレイ</button>
        </section></div>}
        {error && <div className="run-overlay"><section className="run-card" role="alert"><h2>描画を開始できません</h2><p>{error}</p><button onClick={() => location.reload()}>再読み込み</button></section></div>}
      </section>
      <section className="upgrade-bar" aria-label="強化と操作">
        <div className="upgrade-heading"><h2>強化</h2><span className="terrain-status">{hud.terrain}</span></div>
        <div className="upgrade-items">{UPGRADES.map(u => <div className={`upgrade-item ${counts[u.id] ? 'acquired' : ''}`} key={u.id} title={u.detail} aria-label={`${u.name}：${counts[u.id] || 0}回。${u.detail}`}><span className="upgrade-symbol" aria-hidden="true">{u.icon}</span><span>{u.name}</span><strong>{counts[u.id] || 0}</strong></div>)}</div>
        <div className="run-controls"><p><span>WASD / 方向キー：移動</span><span>Space：回避</span><span>P / Esc：一時停止</span></p><div className="dash-status"><span>回避 {hud.dashCooldown > 0 ? `${hud.dashCooldown.toFixed(1)}秒` : '準備完了'}</span><Meter label="回避の再使用" value={hud.stats.dashDelay - hud.dashCooldown} max={hud.stats.dashDelay} /></div><span className="auto-attack">自動攻撃</span></div>
      </section>
    </main>
    <dialog className="upgrade-dialog" ref={upgrades} onCancel={e => e.preventDefault()} onKeyDown={navigateUpgrades} aria-labelledby="upgrade-title" aria-describedby="upgrade-controls">
      <div className="upgrade-title"><h2 id="upgrade-title">強化を選択</h2><span>残り {hud.pendingUpgrades} 回</span></div>
      <div className="upgrade-choices">{UPGRADES.map((u, i) => <button key={u.id} disabled={(counts[u.id] || 0) >= (u.maxLevel || Infinity)} onClick={() => world.current?.upgrade(u.id)}>
        <span className="choice-number" aria-hidden="true">{i + 1}</span><strong>{u.name}</strong><span className="choice-level">取得 {counts[u.id] || 0}{u.maxLevel ? ` / ${u.maxLevel}` : ''} 回</span><span className="choice-detail">{u.detail}</span>
      </button>)}</div>
      <p className="upgrade-controls" id="upgrade-controls">方向キー：選択 · Enter：決定 · 1〜3：即決</p>
    </dialog>
    <dialog className="survivor-help" ref={help} onClose={closeHelp} aria-labelledby="survivor-help-title">
      <div className="help-heading"><h2 id="survivor-help-title">操作方法</h2><button aria-label="操作方法を閉じる" onClick={() => help.current.close()}>閉じる</button></div>
      <dl><div><dt>移動</dt><dd>WASD / 方向キー</dd></div><div><dt>回避</dt><dd>Space</dd></div><div><dt>一時停止・再開</dt><dd>P / Esc</dd></div></dl>
      <p>攻撃は自動です。タッチ操作では左のパッドで移動し、右のボタンで回避します。</p>
      <p>経験値でレベルが上がるか、琥珀色の結晶を拾うと、火力・機動力・耐久力から1つ選べます。選択中は時間が止まります。方向キーで選んでEnterで決定、数字キー1〜3でも選択できます。</p>
      <p>岩壁は移動と双方の弾を遮ります。突進の予告線から横に逃げ、岩壁へ誘導すると敵が気絶します。</p>
      <p>高台は射程 +4・威力 +20%。登り坂では敵の足が鈍ります。中央のぬかるみは自分の移動速度を32%下げます。琥珀色の結晶と回復は決まった地点に出現します。</p>
      <p>45秒ごとにフェーズが変わり、2分15秒生存するとクリアです。</p>
    </dialog>
  </div>;
}
