import React, { useEffect, useMemo, useState } from 'react';
import { SIZE, winningLine } from './ai.js';
const coordinate = i => `${'ABCDEFGHIJKLMNO'[i % SIZE]}${SIZE - Math.floor(i / SIZE)}`;
const modes = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

function HistoryIcon({ direction, end = false }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={direction === 'back' ? 'M14 7l-5 5 5 5' : 'M10 7l5 5-5 5'} />{end && <path d={direction === 'back' ? 'M5 6v12' : 'M19 6v12'} />}</svg>;
}
export default function App() {
  const [moves, setMoves] = useState([]), [cursor, setCursor] = useState(0);
  const [difficulty, setDifficulty] = useState('normal'), [show, setShow] = useState(true);
  const [thinking, setThinking] = useState(false), [analysis, setAnalysis] = useState(null), [error, setError] = useState('');
  const board = useMemo(() => {
    const b = Array(225).fill(0); moves.slice(0, cursor).forEach((index, i) => { b[index] = i % 2 + 1; }); return b;
  }, [moves, cursor]);
  const line = cursor ? winningLine(board, moves[cursor - 1]) : null;
  const reviewing = cursor !== moves.length, ended = !!line || cursor === 225;
  useEffect(() => {
    if (reviewing || ended || cursor % 2 === 0) { setThinking(false); return; }
    setThinking(true); setAnalysis(null); setError('');
    const startedAt = performance.now();
    const worker = new Worker(new URL('./ai.worker.js', import.meta.url), { type: 'module' });
    let timer;
    worker.onmessage = ({ data }) => {
      if (data.type === 'error') { setError('AIの処理に失敗しました。一手戻して再試行してください。'); setThinking(false); return; }
      setAnalysis(data);
      if (data.type === 'done') {
        timer = setTimeout(() => {
          if (data.index >= 0) { setMoves(previous => [...previous, data.index]); setCursor(previous => previous + 1); }
          setThinking(false);
        }, Math.max(0, 280 - (performance.now() - startedAt)));
      }
    };
    worker.onerror = () => { setError('AIを起動できませんでした。一手戻して再試行してください。'); setThinking(false); };
    worker.postMessage({ board, difficulty });
    return () => { worker.terminate(); clearTimeout(timer); };
  }, [board, difficulty, reviewing, ended, cursor]);
  function reset(mode = difficulty) { setDifficulty(mode); setMoves([]); setCursor(0); setAnalysis(null); setError(''); }
  function play(i) {
    if (board[i] || thinking || reviewing || ended || cursor % 2) return;
    setAnalysis(null); setMoves([...moves, i]); setCursor(cursor + 1);
  }
  function undo() {
    const next = cursor % 2 ? cursor - 1 : Math.max(0, cursor - 2);
    setMoves(moves.slice(0, next)); setCursor(next); setAnalysis(null); setError('');
  }
  const status = reviewing ? '棋譜を確認中' : line ? (board[line[0]] === 1 ? 'あなたの勝ち' : 'AIの勝ち') : ended ? '引き分け' : thinking ? '考え中' : 'あなたの番';
  const whiteTurn = line ? board[line[0]] === 2 : !ended && cursor % 2 === 1;
  return <div className="gomoku-app">
    <header className="game-header">
      <div className="game-title"><span className="game-emblem" aria-hidden="true"><i/><i/></span><h1>五目並べ</h1></div>
      <span className="header-detail">15 × 15</span>
    </header>
    <main className="gomoku-layout">
      <section className="board-section" aria-label="対局">
        <div className="turn-strip"><div className="turn-status" role="status"><i className={`turn-stone ${whiteTurn ? 'white' : ''}`}/><span>{status}</span></div><span className="move-count">{cursor}<span> 手</span></span></div>
        <div className="board-stage">
          <div className="board-frame">
            <div className="letters" aria-hidden="true">{'ABCDEFGHIJKLMNO'.split('').map(v => <span key={v}>{v}</span>)}</div>
            <div className="numbers" aria-hidden="true">{Array.from({ length: SIZE }, (_, i) => <span key={i}>{SIZE-i}</span>)}</div>
            <div className="board" role="group" aria-label="15×15の五目並べ盤">
              <div className="grid-lines"/>
              {[48,56,112,168,176].map(i => <span key={i} className="star-point" style={{left:`${(i%15+.5)/15*100}%`,top:`${(Math.floor(i/15)+.5)/15*100}%`}}/>)}
              {board.map((stone, i) => {
                const rank = !reviewing && show ? analysis?.candidates.findIndex(c => c.index === i) ?? -1 : -1;
                return <button key={i} className={`intersection ${stone ? 'occupied' : ''} ${line?.includes(i) ? 'winning' : ''}`} aria-label={`${coordinate(i)} ${stone === 1 ? '黒石' : stone === 2 ? '白石' : '空点'}`} aria-disabled={!!stone || thinking || reviewing || ended || !!(cursor % 2)} onClick={() => play(i)}>
                  {stone ? <span className={`stone ${stone === 1 ? 'black' : 'white'} ${i === moves[cursor-1] ? 'last' : ''}`}/> : rank >= 0 ? <span className={`candidate rank-${rank}`}>{rank+1}</span> : <span className="ghost-stone"/>}
                </button>;
              })}
              {line && <svg className="win-line" viewBox="0 0 15 15"><line x1={line[0]%15+.5} y1={Math.floor(line[0]/15)+.5} x2={line.at(-1)%15+.5} y2={Math.floor(line.at(-1)/15)+.5}/></svg>}
            </div>
          </div>
        </div>
        <div className="board-footer"><span><i className="key-stone"/>あなた<span className="player-order">先手</span></span><span><i className="key-stone light"/>AI<span className="player-order">後手</span></span></div>
      </section>
      <aside className="side-panel" aria-label="対局設定と操作">
        <section className="difficulty-panel">
          <h2>難易度</h2>
          <div className="difficulty" aria-label="難易度">{Object.entries(modes).map(([key,label]) => <button key={key} aria-pressed={difficulty===key} className={difficulty===key?'selected':''} onClick={()=>reset(key)}>{label}</button>)}</div>
        </section>
        <section className="thought-panel">
          <div className="panel-title"><h2 id="thought-label">思考をのぞく</h2><label className="switch"><input type="checkbox" aria-labelledby="thought-label" checked={show} onChange={e=>setShow(e.target.checked)}/><span/></label></div>
          {show && <div className="thought-content">
            {analysis && !reviewing ? <div className="candidates-list" aria-label="候補手と評価値">
              {analysis.candidates.slice(0,3).map((c,i) => <div className="candidate-row" key={c.index}><span className="rank-label">{i+1}</span><strong>{coordinate(c.index)}</strong><div className="evaluation-bar"><span style={{width:`${analysis.candidates[0].score===analysis.candidates.at(-1).score?100:25+75*(c.score-analysis.candidates.at(-1).score)/(analysis.candidates[0].score-analysis.candidates.at(-1).score)}%`}}/></div><span className="evaluation-score">{Math.round(c.score).toLocaleString()}</span></div>)}
            </div> : <p className="thought-empty">{reviewing ? '棋譜を確認中' : thinking ? '候補手を検討中…' : '候補手・評価値'}</p>}
          </div>}
        </section>
        <section className="history-panel">
          <div className="panel-title"><h2>棋譜</h2><span className="history-position">{cursor}<span> / {moves.length}</span></span></div>
          <div className="history-controls">
            <button aria-label="最初へ" disabled={!cursor} onClick={()=>setCursor(0)}><HistoryIcon direction="back" end/></button>
            <button aria-label="一手前へ" disabled={!cursor} onClick={()=>setCursor(cursor-1)}><HistoryIcon direction="back"/></button>
            <button aria-label="一手先へ" disabled={cursor===moves.length} onClick={()=>setCursor(cursor+1)}><HistoryIcon direction="forward"/></button>
            <button aria-label="最新へ" disabled={cursor===moves.length} onClick={()=>setCursor(moves.length)}><HistoryIcon direction="forward" end/></button>
          </div>
          <input className="history-slider" type="range" aria-label="棋譜の手数" aria-valuetext={`${cursor}手目`} min="0" max={moves.length || 1} value={cursor} disabled={!moves.length} onChange={e=>setCursor(Number(e.target.value))}/>
        </section>
        <div className="game-actions"><button disabled={!cursor} onClick={undo}>一手戻す</button><button className="primary" onClick={()=>reset()}>新しい対局</button></div>
        {error && <p className="game-error" role="alert">{error}</p>}
      </aside>
    </main>
  </div>;
}
