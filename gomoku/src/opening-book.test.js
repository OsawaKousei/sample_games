import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseMove } from './ai.js';
import { openingBook } from './opening-book-data.js';
import { lookupOpening, transformOpeningIndex } from './opening-book.js';

function fromKey(key) {
  const board = Array(225).fill(0);
  key.split('/').forEach((stones, color) => {
    if (stones) stones.split(',').forEach(index => { board[Number(index)] = color + 1; });
  });
  return board;
}
function transform(board, symmetry) {
  const next = Array(225).fill(0);
  board.forEach((stone, i) => { next[transformOpeningIndex(i, symmetry)] = stone; });
  return next;
}

test('Hard opening book covers the first three replies and returns legal moves in all eight symmetries', () => {
  const counts = new Set();
  assert.ok(Object.keys(openingBook).length >= 20);
  for (const [key, entry] of Object.entries(openingBook)) {
    const board = fromKey(key);
    counts.add(board.filter(Boolean).length);
    assert.ok(entry.candidates.length > 0);
    assert.ok(entry.depth >= 0);
    for (let symmetry = 0; symmetry < 8; symmetry++) {
      const variant = transform(board, symmetry), original = [...variant];
      const opening = lookupOpening(variant);
      assert.ok(opening, `${key}, symmetry ${symmetry}`);
      const result = chooseMove(variant, 'hard');
      assert.equal(result.book, true);
      assert.equal(result.nodes, 0);
      assert.equal(variant[result.index], 0);
      assert.equal(result.index, opening.index);
      assert.equal(new Set(result.candidates.map(c => c.index)).size, result.candidates.length);
      assert.ok(result.candidates.every(c => variant[c.index] === 0 && Number.isFinite(c.score)));
      assert.deepEqual(variant, original);
    }
  }
  assert.deepEqual([...counts].sort(), [1, 3, 5]);
});

test('Every near-centre second black move has a stored second white reply', () => {
  const board = Array(225).fill(0); board[112] = 1;
  board[chooseMove(board, 'hard').index] = 2;
  for (let y = 5; y <= 9; y++) for (let x = 5; x <= 9; x++) {
    const index = y * 15 + x;
    if (board[index]) continue;
    const next = [...board]; next[index] = 1;
    assert.equal(chooseMove(next, 'hard', { budget: 0 }).book, true, `second black move ${index}`);
  }
});

test('Book recognition requires the whole position and the correct side to move', () => {
  const center = Array(225).fill(0); center[112] = 1;
  assert.ok(lookupOpening(center));
  const offCenter = Array(225).fill(0); offCenter[0] = 1;
  assert.equal(lookupOpening(offCenter), null);
  assert.equal(chooseMove(offCenter, 'hard', { budget: 0 }).book, undefined);
  const changed = [...center]; changed[0] = 1; changed[224] = 2;
  assert.equal(lookupOpening(changed), null);
  const wrongTurn = [...center]; wrongTurn[96] = 2;
  assert.equal(lookupOpening(wrongTurn), null);
  const swapped = center.map(stone => stone ? 3 - stone : 0);
  assert.equal(lookupOpening(swapped), null);
  assert.equal(lookupOpening(Array(225).fill(0)), null);
  assert.equal(lookupOpening([1]), null);
});

test('Positions beyond the book and explicit opt-out use normal Hard search', () => {
  const b = Array(225).fill(0);
  [112, 113, 129, 97].forEach(i => { b[i] = 1; });
  [96, 83, 124].forEach(i => { b[i] = 2; });
  assert.equal(lookupOpening(b), null);
  const r = chooseMove(b, 'hard', { budget: 50 });
  assert.equal(r.book, undefined);
  assert.ok(r.nodes > 0);
  const center = Array(225).fill(0); center[112] = 1;
  const searched = chooseMove(center, 'hard', { openingBook: false, budget: 50 });
  assert.equal(searched.book, undefined);
  assert.ok(searched.nodes > 0);
});

test('Opening book is exclusive to Hard', () => {
  const b = Array(225).fill(0); b[112] = 1;
  for (const mode of ['easy', 'normal']) assert.equal(chooseMove(b, mode).book, undefined);
});
