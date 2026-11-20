import { SIZE, DIRECTIONS } from './rules.js';

// Leave room within the seven-second target for worker startup and stone placement.
export const HARD_BUDGET_MS = 6200;
const CELLS = SIZE * SIZE;
const FIVE = 10_000_000;
const MATE = 100_000_000;
const MAX_DEPTH = 12;
const THREAT_PLIES = 10;
const TT_SIZE = 1 << 18;
const powers = Array.from({ length: 8 }, (_, i) => 3 ** i);
const patternScores = new Int32Array(3 ** 8).fill(-1);
const patternFours = new Uint8Array(3 ** 8);
const patternThrees = new Uint8Array(3 ** 8);

// A direction is encoded by eight neighbours: empty / own / blocked. Board
// edges and opposing stones both block a line. The hypothetical centre is own.
function pattern(code) {
  if (patternScores[code] >= 0) return;
  const cells = new Uint8Array(9);
  cells[4] = 1;
  let digits = code;
  for (let i = 0; i < 9; i++) {
    if (i === 4) continue;
    cells[i] = digits % 3;
    digits = Math.floor(digits / 3);
  }
  let score = 0;
  for (let start = 0; start <= 4; start++) {
    let own = 0, blocked = false;
    for (let j = start; j < start + 5; j++) {
      if (cells[j] === 2) { blocked = true; break; }
      own += cells[j];
    }
    if (blocked) continue;
    if (own === 5) { patternScores[code] = FIVE; return; }
    score += [0, 2, 30, 300, 2000][own];
  }
  function winningPoints() {
    let mask = 0;
    for (let start = 0; start <= 4; start++) {
      let empty = -1, count = 0;
      for (let j = start; j < start + 5; j++) {
        if (cells[j] === 1) count++;
        else if (cells[j] === 0) empty = j;
      }
      if (count === 4 && empty >= 0) mask |= 1 << empty;
    }
    return mask;
  }
  const wins = winningPoints();
  if (wins) {
    const double = !!(wins & (wins - 1));
    patternFours[code] = double ? 2 : 1;
    patternScores[code] = double ? 1_000_000 : 50_000;
    return;
  }
  // Includes broken threes (e.g. .XX.X.) as well as contiguous open threes.
  for (let i = 0; i < 9; i++) {
    if (cells[i]) continue;
    cells[i] = 1;
    const next = winningPoints();
    cells[i] = 0;
    if (next & (next - 1)) {
      patternThrees[code] = 1;
      score = Math.max(score, 8000);
      break;
    }
  }
  patternScores[code] = score;
}

let geometry;
function getGeometry() {
  if (geometry) return geometry;
  const links = Array.from({ length: CELLS }, () => []);
  const nearby = Array.from({ length: CELLS }, () => []);
  const edges = new Int32Array(CELLS * 4);
  for (let i = 0; i < CELLS; i++) {
    const x = i % SIZE, y = Math.floor(i / SIZE);
    for (let d = 0; d < 4; d++) {
      const [dx, dy] = DIRECTIONS[d];
      let digit = 0;
      for (let step = -4; step <= 4; step++) {
        if (!step) continue;
        const a = x + dx * step, b = y + dy * step, power = powers[digit++];
        if (a < 0 || a >= SIZE || b < 0 || b >= SIZE) edges[i * 4 + d] += 2 * power;
        else links[b * SIZE + a].push({ index: i, line: i * 4 + d, power });
      }
    }
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const a = x + dx, b = y + dy;
      if (a >= 0 && a < SIZE && b >= 0 && b < SIZE) nearby[i].push(b * SIZE + a);
    }
  }
  let seed = 0x9e3779b9;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  const hashes = Array.from({ length: 2 }, () => Uint32Array.from({ length: CELLS * 2 + 1 }, random));
  geometry = { links, nearby, edges, hashes };
  return geometry;
}

export class SearchPosition {
  constructor(input) {
    this.board = Uint8Array.from(input);
    this.geometry = getGeometry();
    this.codes = [null, this.geometry.edges.slice(), this.geometry.edges.slice()];
    this.scores = [null, new Int32Array(CELLS), new Int32Array(CELLS)];
    this.fours = [null, new Uint8Array(CELLS), new Uint8Array(CELLS)];
    this.total = [0, 0, 0];
    this.nearby = new Uint8Array(CELLS);
    this.hashA = 0;
    this.hashB = 0;
    this.count = 0;
    for (let i = 0; i < CELLS; i++) {
      const player = this.board[i];
      if (!player) continue;
      this.count++;
      this.hashA ^= this.geometry.hashes[0][i * 2 + player - 1];
      this.hashB ^= this.geometry.hashes[1][i * 2 + player - 1];
      for (const j of this.geometry.nearby[i]) this.nearby[j]++;
      for (const { line, power } of this.geometry.links[i]) {
        this.codes[player][line] += power;
        this.codes[3 - player][line] += 2 * power;
      }
    }
    for (let i = 0; i < CELLS; i++) this.refresh(i);
  }
  refresh(index) {
    for (let player = 1; player <= 2; player++) {
      this.total[player] -= this.scores[player][index];
      let score = 0, fours = 0, threes = 0;
      if (!this.board[index]) {
        for (let d = 0; d < 4; d++) {
          const code = this.codes[player][index * 4 + d];
          pattern(code);
          score += patternScores[code];
          fours += patternFours[code];
          threes += patternThrees[code];
        }
        if (score >= FIVE) score = FIVE;
        else if (fours >= 2) score = 1_000_000;
        else if (fours && threes) score = 150_000;
        else if (threes >= 2) score = 60_000;
      }
      this.scores[player][index] = score;
      this.fours[player][index] = fours;
      this.total[player] += score;
    }
  }
  change(index, player, placing) {
    const sign = placing ? 1 : -1;
    this.board[index] = placing ? player : 0;
    this.count += sign;
    this.hashA ^= this.geometry.hashes[0][index * 2 + player - 1];
    this.hashB ^= this.geometry.hashes[1][index * 2 + player - 1];
    for (const j of this.geometry.nearby[index]) this.nearby[j] += sign;
    for (const { index: j, line, power } of this.geometry.links[index]) {
      this.codes[player][line] += sign * power;
      this.codes[3 - player][line] += sign * 2 * power;
      this.refresh(j);
    }
    this.refresh(index);
  }
  moves(player, limit, preferred = -1, history = null) {
    const moves = [], wins = [], blocks = [];
    for (let i = 0; i < CELLS; i++) {
      if (this.board[i] || !this.nearby[i]) continue;
      const attack = this.scores[player][i], defend = this.scores[3 - player][i];
      const move = { index: i, attack, defend, score: attack + defend * 1.08 };
      if (attack >= FIVE) wins.push(move);
      if (defend >= FIVE) blocks.push(move);
      move.order = move.score + (i === preferred ? 1e10 : 0) + (history?.[i] ?? 0);
      moves.push(move);
    }
    if (wins.length) return { moves: wins, terminal: 1 };
    if (blocks.length > 1) return { moves: blocks, terminal: -1 };
    if (blocks.length) return { moves: blocks, forced: true };
    const forks = moves.filter(c => this.fours[player][c.index] >= 2);
    if (forks.length) return { moves: forks, terminal: 1, fork: true };
    moves.sort((a, b) => b.order - a.order);
    // Keep every forcing or defensive tactical move even outside the quiet cap.
    return { moves: moves.filter((c, i) => i < limit || c.attack >= 50_000 || c.defend >= 50_000) };
  }
  evaluate(player) {
    let own = 0, other = 0;
    for (let i = 0; i < CELLS; i++) {
      own = Math.max(own, this.scores[player][i]);
      other = Math.max(other, this.scores[3 - player][i]);
    }
    return Math.round(own * .8 - other * .9 + (this.total[player] - this.total[3 - player]) * .08);
  }
}

export function searchHardMove(input, options) {
  const { start, deadline, fallback, onProgress } = options;
  let ranked = fallback, completedDepth = 0, nodes = 0, prunes = 0, cacheHits = 0;
  const result = () => ({ index: ranked[0]?.index ?? -1, candidates: ranked.slice(0, 5), depth: completedDepth, nodes, prunes, cacheHits, elapsed: Math.round(performance.now() - start) });
  if (performance.now() >= deadline) return result();
  const position = new SearchPosition(input);
  if (!position.count) { ranked = [{ index: Math.floor(CELLS / 2), score: 0 }]; return result(); }
  const root = position.moves(2, 24);
  if (root.terminal) {
    ranked = root.moves.map(c => ({ ...c, score: root.terminal * (MATE - (root.fork ? 3 : 1)) }));
    return result();
  }
  // A single immediate block requires no search; there are no other legal saves.
  if (root.forced) { ranked = root.moves; return result(); }
  ranked = root.moves;
  const ttA = new Int32Array(TT_SIZE), ttB = new Int32Array(TT_SIZE);
  const ttDepth = new Int8Array(TT_SIZE).fill(-1), ttFlag = new Uint8Array(TT_SIZE);
  const ttValue = new Int32Array(TT_SIZE), ttMove = new Int16Array(TT_SIZE).fill(-1);
  const history = [null, new Int32Array(CELLS), new Int32Array(CELLS)];
  const timeout = Symbol('search deadline');
  function checkTime() { if (performance.now() >= deadline) throw timeout; }
  function terminalValue(info, ply) { return info.terminal * (MATE - ply - (info.fork ? 3 : info.terminal === 1 ? 1 : 2)); }
  function valueAfter(move, player, callback) {
    position.change(move.index, player, true);
    try { return -callback(); }
    finally { position.change(move.index, player, false); }
  }
  // Resolve forcing fours beyond the nominal depth. A static evaluation in the
  // middle of a forced reply otherwise hides multi-move wins and counterattacks.
  function quiescence(alpha, beta, player, ply, remaining) {
    nodes++;
    checkTime();
    const info = position.moves(player, 12);
    if (info.terminal) return terminalValue(info, ply);
    if (!info.moves.length) return 0;
    const standPat = position.evaluate(player);
    if (remaining <= 0) return standPat;
    const threatened = info.forced || info.moves.some(c => c.defend >= 60_000);
    let best = threatened ? -MATE : standPat;
    if (!threatened) {
      if (best >= beta) return best;
      alpha = Math.max(alpha, best);
    }
    const moves = threatened ? info.moves : info.moves.filter(c => position.fours[player][c.index]);
    for (const move of moves) {
      const score = valueAfter(move, player, () => quiescence(-beta, -alpha, 3 - player, ply + 1, remaining - 1));
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
      if (alpha >= beta) { prunes++; break; }
    }
    return best;
  }
  function search(depth, alpha, beta, player, ply) {
    if (depth <= 0) return quiescence(alpha, beta, player, ply, THREAT_PLIES);
    nodes++;
    checkTime();
    const originalAlpha = alpha;
    const a = position.hashA ^ (player === 1 ? position.geometry.hashes[0][CELLS * 2] : 0);
    const b = position.hashB ^ (player === 1 ? position.geometry.hashes[1][CELLS * 2] : 0);
    const slot = a & (TT_SIZE - 1);
    let preferred = -1;
    if (ttDepth[slot] >= 0 && ttA[slot] === a && ttB[slot] === b) {
      preferred = ttMove[slot];
      if (ttDepth[slot] >= depth) {
        let value = ttValue[slot];
        if (value > MATE / 2) value -= ply;
        else if (value < -MATE / 2) value += ply;
        if (ttFlag[slot] === 0 || (ttFlag[slot] === 1 && value >= beta) || (ttFlag[slot] === 2 && value <= alpha)) { cacheHits++; return value; }
      }
    }
    const info = position.moves(player, 14, preferred, history[player]);
    if (info.terminal) return terminalValue(info, ply);
    if (!info.moves.length) return 0;
    let best = -MATE, bestMove = info.moves[0].index;
    for (let i = 0; i < info.moves.length; i++) {
      const move = info.moves[i];
      const score = valueAfter(move, player, () => {
        if (!i) return search(depth - 1, -beta, -alpha, 3 - player, ply + 1);
        const reduction = depth >= 3 && i >= 5 && !info.forced && move.attack < 8000 && move.defend < 8000 ? 1 : 0;
        let value = -search(depth - 1 - reduction, -alpha - 1, -alpha, 3 - player, ply + 1);
        if (reduction && value > alpha) value = -search(depth - 1, -alpha - 1, -alpha, 3 - player, ply + 1);
        if (value > alpha && value < beta) value = -search(depth - 1, -beta, -alpha, 3 - player, ply + 1);
        return -value;
      });
      if (score > best) { best = score; bestMove = move.index; }
      alpha = Math.max(alpha, best);
      if (alpha >= beta) {
        prunes++;
        if (move.attack < 8000) history[player][move.index] = Math.min(2000, history[player][move.index] + depth * depth);
        break;
      }
    }
    ttA[slot] = a; ttB[slot] = b; ttDepth[slot] = depth; ttMove[slot] = bestMove;
    ttValue[slot] = best > MATE / 2 ? best + ply : best < -MATE / 2 ? best - ply : best;
    ttFlag[slot] = best <= originalAlpha ? 2 : best >= beta ? 1 : 0;
    return best;
  }
  const maxDepth = Math.min(MAX_DEPTH, Math.max(1, options.maxDepth ?? MAX_DEPTH));
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next = [];
    let alpha = -MATE;
    try {
      for (const move of ranked) {
        checkTime();
        const score = valueAfter(move, 2, () => {
          if (!next.length) return search(depth - 1, -MATE, -alpha, 1, 1);
          let value = -search(depth - 1, -alpha - 1, -alpha, 1, 1);
          if (value > alpha) value = -search(depth - 1, -MATE, -alpha, 1, 1);
          return -value;
        });
        next.push({ ...move, score });
        alpha = Math.max(alpha, score);
      }
      ranked = next.sort((a, b) => b.score - a.score);
      completedDepth = depth;
      onProgress?.({ ...result(), searchingDepth: depth });
      if (Math.abs(ranked[0].score) > MATE / 2) break;
    } catch (error) {
      if (error !== timeout) throw error;
      break;
    }
  }
  return result();
}
