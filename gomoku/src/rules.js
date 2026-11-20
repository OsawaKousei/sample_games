export const SIZE = 15;
export const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];
const inside = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
export function winningLine(board, index) {
  const stone = board[index];
  if (!stone) return null;
  const x = index % SIZE, y = Math.floor(index / SIZE);
  for (const [dx, dy] of DIRECTIONS) {
    const line = [index];
    for (const sign of [-1, 1]) {
      let a = x + dx * sign, b = y + dy * sign;
      while (inside(a, b) && board[b * SIZE + a] === stone) {
        line.push(b * SIZE + a); a += dx * sign; b += dy * sign;
      }
    }
    if (line.length >= 5) return line.sort((a, b) => a - b);
  }
  return null;
}
// Evaluate contiguous lines and every five-cell window containing the move.
export function pointScore(board, index, player) {
  if (board[index]) return -Infinity;
  const x = index % SIZE, y = Math.floor(index / SIZE);
  let score = 0;
  for (const [dx, dy] of DIRECTIONS) {
    let count = 1, open = 0;
    for (const sign of [-1, 1]) {
      let a = x + dx * sign, b = y + dy * sign;
      while (inside(a, b) && board[b * SIZE + a] === player) { count++; a += dx * sign; b += dy * sign; }
      if (inside(a, b) && board[b * SIZE + a] === 0) open++;
    }
    if (count >= 5) return 10_000_000;
    score += count === 4 ? (open === 2 ? 180_000 : open ? 28_000 : 0)
      : count === 3 ? (open === 2 ? 9_000 : open ? 700 : 0)
      : count === 2 ? (open === 2 ? 450 : open ? 90 : 0) : open * 5;
    for (let start = -4; start <= 0; start++) {
      let stones = 0, valid = true;
      for (let k = start; k < start + 5; k++) {
        const a = x + dx * k, b = y + dy * k;
        if (!inside(a, b) || (board[b * SIZE + a] && board[b * SIZE + a] !== player)) { valid = false; break; }
        if (k === 0 || board[b * SIZE + a] === player) stones++;
      }
      if (valid) score += [0, 1, 12, 150, 1800, 0][stones];
    }
  }
  return score;
}
export function candidates(board, player = 2, limit = 12) {
  const nearby = new Set();
  board.forEach((stone, i) => {
    if (!stone) return;
    const x = i % SIZE, y = Math.floor(i / SIZE);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (inside(x + dx, y + dy) && !board[(y + dy) * SIZE + x + dx]) nearby.add((y + dy) * SIZE + x + dx);
    }
  });
  if (!nearby.size) return board.every(v => !v) ? [{ index: 112, score: 0, attack: 0, defend: 0 }] : [];
  return [...nearby].map(index => {
    const attack = pointScore(board, index, player), defend = pointScore(board, index, 3 - player);
    const center = 14 - Math.abs(index % SIZE - 7) - Math.abs(Math.floor(index / SIZE) - 7);
    return { index, attack, defend, score: attack >= 10_000_000 ? 1e9 : defend >= 10_000_000 ? 1e8 + attack : attack + defend * 1.1 + center };
  }).sort((a, b) => b.score - a.score).slice(0, limit);
}
