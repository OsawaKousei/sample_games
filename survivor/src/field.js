export const WORLD_RADIUS = 29;
export const PLAYER_RADIUS = .5;
// Shared by collision, navigation and the renderer. Decorative trees stay outside.
export const OBSTACLES = [
  { x: -7, z: 0, width: 2.4, depth: 10, height: 3.2 },
  { x: 7, z: 0, width: 2.4, depth: 10, height: 3.2 },
  { x: 0, z: -10, width: 8, depth: 2.4, height: 3.4 },
  { x: 0, z: 10, width: 8, depth: 2.4, height: 3.4 },
  { x: -16, z: 8, width: 3, depth: 3, height: 3 },
  { x: 16, z: -8, width: 3, depth: 3, height: 3 },
];
export const HILLS = [{ x: -14, z: -10, radius: 8 }, { x: 14, z: 10, radius: 8 }];
export const SUPPLIES = [{ x: -14, z: -10 }, { x: 14, z: 10 }, { x: 14, z: -16 }, { x: -14, z: 16 }];
export function terrainHeight(x, z) {
  let height = .12 * Math.sin(x * .24) + .12 * Math.cos(z * .21);
  for (const h of HILLS) {
    const t = Math.max(0, Math.min(1, (h.radius - Math.hypot(x - h.x, z - h.z)) / 4));
    height += 3.2 * t * t * (3 - 2 * t);
  }
  return height - .45 * Math.max(0, 1 - Math.hypot(x, z) / 6);
}
export const isHighGround = (x, z) => HILLS.some(h => Math.hypot(x - h.x, z - h.z) < 4.2);
export const isMud = (x, z) => Math.hypot(x, z) < 5.5;
export function blocked(x, z, radius = PLAYER_RADIUS) {
  return OBSTACLES.some(o => Math.abs(x - o.x) < o.width / 2 + radius && Math.abs(z - o.z) < o.depth / 2 + radius);
}
export function segmentBlocked(x, z, tx, tz, radius = 0) {
  return OBSTACLES.some(o => {
    let lo = 0, hi = 1;
    for (const [p, d, min, max] of [[x, tx - x, o.x - o.width / 2 - radius, o.x + o.width / 2 + radius], [z, tz - z, o.z - o.depth / 2 - radius, o.z + o.depth / 2 + radius]]) {
      if (Math.abs(d) < 1e-9) { if (p < min || p > max) return false; }
      else { const a = (min - p) / d, b = (max - p) / d; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); if (lo > hi) return false; }
    }
    return true;
  });
}
export function moveBody(body, dx, dz, radius = PLAYER_RADIUS) {
  const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .2));
  let collided = false;
  for (let i = 0; i < count; i++) {
    if (!blocked(body.x + dx / count, body.z, radius)) body.x += dx / count; else collided = true;
    if (!blocked(body.x, body.z + dz / count, radius)) body.z += dz / count; else collided = true;
    const d = Math.hypot(body.x, body.z), edge = WORLD_RADIUS - radius;
    if (d > edge) { body.x *= edge / d; body.z *= edge / d; collided = true; }
  }
  return collided;
}
export function terrainSpeed(x, z, dx, dz, enemy = false) {
  const len = Math.hypot(dx, dz) || 1;
  const rise = terrainHeight(x + dx / len * .5, z + dz / len * .5) - terrainHeight(x, z);
  return (isMud(x, z) ? (enemy ? .87 : .68) : 1) * Math.max(enemy ? .48 : .68, Math.min(1.08, 1 - Math.max(0, rise) * (enemy ? 1.3 : .65)));
}
export function freePoint(x, z, radius = .8) {
  const p = { x, z }; const d = Math.hypot(x, z);
  if (d > WORLD_RADIUS - radius) { p.x *= (WORLD_RADIUS - radius) / d; p.z *= (WORLD_RADIUS - radius) / d; }
  if (!blocked(p.x, p.z, radius)) return p;
  for (let r = 1; r < 8; r++) for (let i = 0; i < 16; i++) {
    const tx = p.x + Math.cos(i * Math.PI / 8) * r, tz = p.z + Math.sin(i * Math.PI / 8) * r;
    if (Math.hypot(tx, tz) < WORLD_RADIUS - radius && !blocked(tx, tz, radius)) return { x: tx, z: tz };
  }
  return { x: 0, z: 7 };
}
// A shared, static navigation graph. All eight links respect inflated walls;
// runners, including their dash, use the same collision shapes as the player.
const nodes = [];
for (let z = -28; z <= 28; z += 2) for (let x = -28; x <= 28; x += 2) nodes.push({ x, z, walk: Math.hypot(x, z) < 28 && !blocked(x, z, .96), links: [] });
for (let i = 0; i < nodes.length; i++) {
  const n = nodes[i]; if (!n.walk) continue;
  for (const offset of [-30, -29, -28, -1, 1, 28, 29, 30]) {
    const j = i + offset, m = nodes[j];
    if (m?.walk && Math.abs(n.x - m.x) <= 2 && Math.abs(n.z - m.z) <= 2 && !segmentBlocked(n.x, n.z, m.x, m.z, .96)) n.links.push(j);
  }
}
const nearestNode = (x, z) => {
  let best = 0, distance = Infinity;
  for (let i = 0; i < nodes.length; i++) if (nodes[i].walk) {
    const n = nodes[i], d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < distance) { distance = d; best = i; }
  }
  return best;
};
export function navigationTo(x, z) {
  const distance = new Int16Array(nodes.length).fill(32767), root = nearestNode(x, z), queue = [root]; distance[root] = 0;
  for (let i = 0; i < queue.length; i++) for (const j of nodes[queue[i]].links) if (distance[j] === 32767) { distance[j] = distance[queue[i]] + 1; queue.push(j); }
  return distance;
}
export function pursuitTarget(enemy, player, navigation) {
  if (!segmentBlocked(enemy.x, enemy.z, player.x, player.z, enemy.radius)) return player;
  const i = nearestNode(enemy.x, enemy.z);
  let best = i;
  for (const j of nodes[i].links) if (navigation[j] < navigation[best] && !segmentBlocked(enemy.x, enemy.z, nodes[j].x, nodes[j].z, enemy.radius)) best = j;
  return nodes[best];
}
