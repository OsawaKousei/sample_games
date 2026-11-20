// Lasers are finite capsules. Warning and fade frames never deal damage.
export function addLaser(s, x1, y1, x2, y2, options = {}) {
  s.lasers.push({ id: ++s.id, x1, y1, x2, y2, age: 0, warning: .9, duration: 1.6, fade: .22,
    width: 10, color: 0x91e9ff, ...options });
}
export function laserActive(laser) {
  return laser.age >= laser.warning && laser.age < laser.warning + laser.duration;
}
export function updateLasers(s, dt) {
  for (const laser of s.lasers) laser.age += dt;
  s.lasers = s.lasers.filter(laser => laser.age < laser.warning + laser.duration + laser.fade);
}
const cross = (ax, ay, bx, by) => ax * by - ay * bx;
function pointDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}
export function laserHits(laser, oldX, oldY, x, y, radius = 3) {
  if (!laserActive(laser)) return false;
  const { x1, y1, x2, y2 } = laser;
  const dx = x - oldX, dy = y - oldY, lx = x2 - x1, ly = y2 - y1;
  const denominator = cross(dx, dy, lx, ly);
  if (denominator) {
    const t = cross(x1 - oldX, y1 - oldY, lx, ly) / denominator;
    const u = cross(x1 - oldX, y1 - oldY, dx, dy) / denominator;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
  }
  return Math.min(pointDistance(x, y, x1, y1, x2, y2), pointDistance(oldX, oldY, x1, y1, x2, y2),
    pointDistance(x1, y1, oldX, oldY, x, y), pointDistance(x2, y2, oldX, oldY, x, y)) < radius + laser.width / 2;
}
