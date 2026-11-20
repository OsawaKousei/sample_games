import { DANMAKU_COLORS } from './patterns.js';

const SIZE = 16, HALF = SIZE / 2;
const TEXTURE = 'round-bullets';

// Bake the halo, body and white core once. A bullet then costs one textured
// quad instead of three circles tessellated on every frame (WebGL and Canvas).
export class BulletRenderer {
  constructor(scene) {
    const colors = [...DANMAKU_COLORS, 0xff8c95, 0xffba72];
    const texture = scene.textures.createCanvas(TEXTURE, SIZE * 8, SIZE * 3);
    const ctx = texture.getContext();
    this.frames = new Map();
    let index = 0;
    for (const color of colors) {
      const radii = new Map();
      this.frames.set(color, radii);
      for (const radius of [3.5, 4]) {
        const frames = [];
        radii.set(radius, frames);
        for (const waiting of [false, true]) {
          const x = index % 8 * SIZE, y = Math.floor(index / 8) * SIZE;
          const circle = (r, fill, alpha) => {
            ctx.globalAlpha = alpha; ctx.fillStyle = fill; ctx.beginPath();
            ctx.arc(x + HALF, y + HALF, r, 0, Math.PI * 2); ctx.fill();
          };
          const fill = `#${color.toString(16).padStart(6, '0')}`;
          circle(radius + 2, fill, .16);
          circle(radius, fill, waiting ? .3 : 1);
          circle(1.4, '#fff4fa', 1);
          frames.push(texture.add(String(index++), 0, x, y, SIZE, SIZE));
        }
      }
    }
    texture.refresh();
    this.blitter = scene.add.blitter(0, 0, TEXTURE, '0');
    this.pool = [];
    this.count = 0;
  }

  draw(bullets, width, height) {
    let count = 0;
    for (const b of bullets) {
      // Keep offscreen bullets in the simulation; they can return later.
      if (b.x < -HALF || b.x > width + HALF || b.y < -HALF || b.y > height + HALF) continue;
      const frame = this.frames.get(b.color).get(b.radius)[b.age < (b.wait || 0) ? 1 : 0];
      let bob = this.pool[count];
      if (!bob) {
        bob = this.blitter.create(0, 0, frame);
        this.pool.push(bob);
      }
      bob.x = b.x - HALF; bob.y = b.y - HALF;
      bob.setFrame(frame); bob.setVisible(true);
      count++;
    }
    for (let i = count; i < this.count; i++) this.pool[i].setVisible(false);
    this.count = count;
  }
}
