import { SIZE } from './rules.js';
import { openingBook } from './opening-book-data.js';

// Only board symmetries are equivalent. Translating a position would change its
// distance from the edges, so an opening near an edge must go through search.
export function transformOpeningIndex(index, symmetry) {
  let x = index % SIZE, y = Math.floor(index / SIZE);
  if (symmetry >= 4) x = SIZE - 1 - x;
  for (let r = 0; r < symmetry % 4; r++) [x, y] = [SIZE - 1 - y, x];
  return y * SIZE + x;
}

export function canonicalOpening(board) {
  const black = [], white = [];
  board.forEach((stone, index) => {
    if (stone === 1) black.push(index);
    else if (stone === 2) white.push(index);
  });
  let best;
  for (let symmetry = 0; symmetry < 8; symmetry++) {
    const transform = stones => stones.map(i => transformOpeningIndex(i, symmetry)).sort((a, b) => a - b);
    const key = `${transform(black).join(',')}/${transform(white).join(',')}`;
    if (!best || key < best.key) best = { key, symmetry };
  }
  return best;
}

export function lookupOpening(board) {
  if (board.length !== SIZE * SIZE) return null;
  let black = 0, white = 0;
  for (const stone of board) {
    if (stone === 1) black++;
    else if (stone === 2) white++;
    else if (stone !== 0) return null;
  }
  if (black !== white + 1 || white > 2) return null;
  const { key, symmetry } = canonicalOpening(board);
  const entry = openingBook[key];
  if (!entry) return null;
  const inverse = new Int16Array(SIZE * SIZE);
  for (let i = 0; i < inverse.length; i++) inverse[transformOpeningIndex(i, symmetry)] = i;
  const candidates = entry.candidates.map(([index, score]) => ({ index: inverse[index], score }));
  if (!candidates.length || candidates.some(c => board[c.index] !== 0)) return null;
  return { index: candidates[0].index, candidates, bookDepth: entry.depth };
}
