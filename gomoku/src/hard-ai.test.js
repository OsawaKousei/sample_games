import test from 'node:test';
import assert from 'node:assert/strict';
import { SearchPosition } from './hard-ai.js';
import { winningLine, DIRECTIONS } from './rules.js';

// Incremental state must match a fresh reconstruction after both moves and undo.
test('Hard incremental scores, hashes and candidate neighbourhoods survive make/unmake', () => {
  const board = Array(225).fill(0), state = new SearchPosition(board), played = [];
  let seed = 123456;
  function check() {
    const fresh = new SearchPosition(board);
    for (const key of ['codes', 'scores', 'fours', 'total', 'nearby', 'hashA', 'hashB', 'count']) {
      assert.deepEqual(state[key], fresh[key], key);
    }
  }
  for (let turn = 0; turn < 45; turn++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    let index = seed % 225;
    while (board[index]) index = (index + 1) % 225;
    const player = turn % 2 + 1;
    board[index] = player; played.push([index, player]);
    state.change(index, player, true);
    check();
  }
  for (const [index, player] of played.reverse()) {
    board[index] = 0;
    state.change(index, player, false);
    check();
  }
});

test('Hard pattern table recognises straight and broken fours in all directions', () => {
  for (const [dx, dy] of DIRECTIONS) for (const steps of [[-3, -2, -1], [-3, -1, 1]]) {
    const b = Array(225).fill(0);
    for (const step of steps) b[(7 + step * dy) * 15 + 7 + step * dx] = 2;
    const state = new SearchPosition(b);
    b[112] = 2;
    let wins = 0;
    for (let i = 0; i < 225; i++) {
      if (b[i]) continue;
      b[i] = 2;
      if (winningLine(b, i)) wins++;
      b[i] = 0;
    }
    assert.equal(state.fours[2][112], wins);
  }
});

test('Hard winning-point scores agree with freestyle rules, including edges and overlines', () => {
  const boards = [];
  for (const [dx, dy] of DIRECTIONS) {
    const b = Array(225).fill(0);
    for (const step of [-3, -2, -1, 1, 2]) b[(7 + step * dy) * 15 + 7 + step * dx] = 2;
    boards.push(b);
  }
  const edge = Array(225).fill(0); [13, 14, 15, 16, 17].forEach(i => { edge[i] = 1; }); boards.push(edge);
  for (const b of boards) {
    const state = new SearchPosition(b);
    for (let player = 1; player <= 2; player++) for (let i = 0; i < 225; i++) {
      if (b[i]) continue;
      b[i] = player;
      assert.equal(state.scores[player][i] >= 10_000_000, !!winningLine(b, i), `player ${player}, cell ${i}`);
      b[i] = 0;
    }
  }
});
