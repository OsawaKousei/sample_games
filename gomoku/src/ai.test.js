import test from 'node:test';
import assert from 'node:assert/strict';
import { winningLine, chooseMove, candidates } from './ai.js';
const empty=()=>Array(225).fill(0);
test('horizontal, vertical and both diagonal wins; edges do not wrap',()=>{
  for(const step of [1,15,16,14]){const b=empty(),start=step===14?14:0;for(let i=0;i<5;i++)b[start+i*step]=1;assert.equal(winningLine(b,start).length,5);}
  const b=empty();[13,14,15,16,17].forEach(i=>b[i]=1);assert.equal(winningLine(b,15),null);
});
test('six in a row is a win in freestyle rules',()=>{const b=empty();for(let i=0;i<6;i++)b[75+i]=2;assert.equal(winningLine(b,78).length,6);});
for(const mode of ['easy','normal','hard']){
  test(`${mode} takes an immediate win and blocks immediate loss`,()=>{
    for(const player of [1,2]){const b=empty();b[105]=3-player;for(let i=1;i<5;i++)b[105+i]=player;const before=[...b];assert.equal(chooseMove(b,mode).index,110);assert.deepEqual(b,before);}
  });
}
test('Hard produces legal bounded iterative search without mutating the board',()=>{
  const b=empty();b[112]=1;b[113]=2;b[128]=1;b[97]=2;
  const original=[...b],progress=[];const r=chooseMove(b,'hard',{budget:100,onProgress:p=>progress.push(p)});
  assert.equal(b[r.index],0);assert.ok(r.depth<=12);assert.ok(r.nodes>0);assert.ok(r.elapsed<400);assert.ok(progress.length);assert.deepEqual(b,original);
});
test('full board returns no legal move and empty board opens in the center',()=>{assert.equal(chooseMove(Array(225).fill(1),'hard').index,-1);assert.equal(candidates(empty())[0].index,112);});

const position = (white, black) => {
  const board = empty();
  white.forEach(([x, y]) => { board[y * 15 + x] = 2; });
  black.forEach(([x, y]) => { board[y * 15 + x] = 1; });
  return board;
};
const winningMoves = (board, player) => board.flatMap((stone, i) => {
  if (stone) return [];
  const next = [...board]; next[i] = player;
  return winningLine(next, i) ? [i] : [];
});

test('Easy develops near existing stones and varies only among useful moves', () => {
  const b = empty(); b[112] = 1;
  const useful = candidates(b).slice(0, 3);
  const selected = new Set();
  for (const random of [0, .59, .61, .89, .99]) {
    const r = chooseMove(b, 'easy', { random: () => random });
    assert.ok(useful.some(c => c.index === r.index));
    assert.ok(Math.abs(r.index % 15 - 7) <= 2);
    assert.ok(Math.abs(Math.floor(r.index / 15) - 7) <= 2);
    selected.add(r.index);
  }
  assert.ok(selected.size > 1);
});

test('Easy stops an open three before it becomes an unstoppable four', () => {
  const b = position([[2, 2], [11, 3]], [[6, 7], [7, 7], [8, 7]]);
  for (const random of [0, .5, .99]) {
    assert.ok([110, 114].includes(chooseMove(b, 'easy', { random: () => random }).index));
  }
});

for (const mode of ['easy', 'normal', 'hard']) {
  test(`${mode} completes or blocks a broken four and wins before defending`, () => {
    for (const player of [1, 2]) {
      const b = empty();
      [108, 109, 111, 112].forEach(i => { b[i] = player; });
      assert.equal(chooseMove(b, mode).index, 110);
    }
    const b = position([[3, 5], [4, 5], [5, 5], [6, 5]], [[3, 9], [4, 9], [5, 9], [6, 9]]);
    assert.ok(winningMoves(b, 2).includes(chooseMove(b, mode).index));
  });
}

test('Hard makes a double four in every orientation', () => {
  for (let rotation = 0; rotation < 4; rotation++) {
    const rotate = ([x, y]) => { for (let n = 0; n < rotation; n++) [x, y] = [14 - y, x]; return [x, y]; };
    const b = position(
      [[4, 7], [5, 7], [6, 7], [7, 4], [7, 5], [7, 6]].map(rotate),
      [[3, 7], [7, 3], [8, 8], [9, 9], [8, 9], [9, 8], [3, 3]].map(rotate),
    );
    const r = chooseMove(b, 'hard', { budget: 100 });
    assert.equal(r.index, 112);
    b[r.index] = 2;
    assert.equal(winningMoves(b, 1).length, 0);
    assert.equal(winningMoves(b, 2).length, 2);
  }
});

test('Hard sees a forced five-ply win beyond a one-ply nominal search', () => {
  const b = position([[4, 7], [5, 7], [6, 7], [7, 4], [7, 5]], [[3, 7], [9, 9], [10, 10], [9, 10], [10, 9], [2, 2]]);
  const r = chooseMove(b, 'hard', { budget: 500, maxDepth: 1 });
  assert.equal(r.index, 112);
  assert.ok(r.candidates[0].score > 90_000_000);
  b[r.index] = 2;
  const forced = winningMoves(b, 2);
  assert.equal(forced.length, 1);
  assert.equal(winningMoves(b, 1).length, 0);
  b[forced[0]] = 1;
  const continuation = chooseMove(b, 'hard', { budget: 100 });
  b[continuation.index] = 2;
  assert.equal(winningMoves(b, 1).length, 0);
  assert.ok(winningMoves(b, 2).length >= 2);
});

test('Hard prevents a double-three fork instead of chasing an unrelated attack', () => {
  const b = position([[2, 2], [4, 10], [12, 3]], [[6, 7], [8, 7], [7, 6], [7, 8]]);
  const r = chooseMove(b, 'hard', { budget: 500, maxDepth: 2 });
  assert.equal(r.index, 112);
});

test('Hard returns a legal fallback when its budget is already exhausted', () => {
  const b = position([[8, 7]], [[7, 7], [8, 8]]), original = [...b];
  const r = chooseMove(b, 'hard', { budget: 0 });
  assert.equal(b[r.index], 0);
  assert.equal(r.depth, 0);
  assert.deepEqual(b, original);
});

test('Hard reaches beyond the former three-ply limit and reuses searched positions', () => {
  const b = empty(); b[112] = 1;
  const r = chooseMove(b, 'hard', { budget: 1500, maxDepth: 4, openingBook: false });
  assert.equal(r.depth, 4);
  assert.ok(r.cacheHits > 0);
  assert.ok(r.elapsed < 1800);
});
