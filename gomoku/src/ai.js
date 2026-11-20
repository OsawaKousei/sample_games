import { searchHardMove, HARD_BUDGET_MS } from './hard-ai.js';
export { HARD_BUDGET_MS } from './hard-ai.js';
import { candidates } from './rules.js';
import { lookupOpening } from './opening-book.js';
export { SIZE, DIRECTIONS, winningLine, pointScore, candidates } from './rules.js';

export function chooseMove(input, difficulty = 'normal', options = {}) {
  const board = [...input], start = performance.now();
  const root = candidates(board, 2, 10);
  const result = (move, ranked = root) => ({ index: move?.index ?? -1, candidates: ranked.slice(0, 5), nodes: 0, prunes: 0, depth: 0, elapsed: Math.round(performance.now() - start) });
  if (!root.length) return result(null);
  if (root[0].attack >= 1e7 || root[0].defend >= 1e7) return result(root[0]);
  if (difficulty === 'easy') {
    // Never randomize away an urgent attack or defence. Otherwise vary between
    // nearby, similarly useful moves rather than arbitrary empty intersections.
    if (root[0].attack >= 9000 || root[0].defend >= 9000) return result(root[0]);
    const pool = root.slice(0, 3).filter(c => c.score >= root[0].score * .7);
    const weights = [6, 3, 1];
    let roll = (options.random ?? Math.random)() * weights.slice(0, pool.length).reduce((a, b) => a + b, 0);
    const move = pool.find((_, i) => (roll -= weights[i]) < 0) ?? pool.at(-1);
    return result(move);
  }
  if (difficulty !== 'hard') return result(root[0]);
  if (options.openingBook !== false) {
    const opening = lookupOpening(board);
    if (opening) return { ...result(opening, opening.candidates), book: true, bookDepth: opening.bookDepth };
  }
  return searchHardMove(board, {
    ...options,
    start,
    deadline: start + Math.min(HARD_BUDGET_MS, Math.max(0, options.budget ?? HARD_BUDGET_MS)),
    fallback: root,
  });
}
