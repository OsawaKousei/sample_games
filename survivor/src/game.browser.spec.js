import { test, expect } from '@playwright/test';
const url = 'http://127.0.0.1:3102';
const fits = async page => {
  const dimensions = await page.evaluate(() => ({ w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight }));
  expect(dimensions.sw).toBeLessThanOrEqual(dimensions.w); expect(dimensions.sh).toBeLessThanOrEqual(dimensions.h);
  for (const selector of ['.run-hud', '.world-shell', '.upgrade-bar', '.header-actions']) {
    const box = await page.locator(selector).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(dimensions.w + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(dimensions.h + 1);
  }
  for (const card of await page.locator('.run-card').all()) {
    const overflow = await card.evaluate(el => ({ pixels: el.scrollHeight - el.clientHeight, viewport: `${innerWidth}x${innerHeight}`, title: el.querySelector('h2')?.textContent }));
    expect(overflow.pixels, `${overflow.viewport} ${overflow.title}`).toBeLessThanOrEqual(1);
  }
};

test('Wildbloom: play, dash, pause, help and retry in the real 3D world', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(url); await expect(page.locator('.world-canvas canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/survivor-title.png' });
  await page.getByRole('button', { name: 'ゲーム開始', exact: true }).click();
  await expect(page.locator('.intro-layer')).toHaveCount(0);
  await page.keyboard.down('d'); await page.waitForTimeout(700); await page.keyboard.up('d'); await page.keyboard.press('Space', { delay: 120 });
  await expect(page.locator('.dash-status')).not.toContainText('準備完了');
  await page.screenshot({ path: 'test-results/survivor-playing.png' });
  await page.getByRole('button', { name: '一時停止', exact: true }).click();
  await expect(page.getByRole('heading', { name: '一時停止' })).toBeVisible();
  const time = await page.locator('.survival-time').innerText(); await page.waitForTimeout(300);
  expect(await page.locator('.survival-time').innerText()).toEqual(time);
  await page.getByRole('button', { name: '操作方法', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '操作方法', exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('heading', { name: '一時停止' })).toBeVisible();
  await page.locator('.run-card').getByRole('button', { name: '再開する', exact: true }).click();
  await page.getByRole('button', { name: '操作方法', exact: true }).click();
  await page.getByRole('button', { name: '操作方法を閉じる', exact: true }).click();
  await expect(page.locator('.run-overlay')).toHaveCount(0);
  await page.keyboard.press('p'); await page.getByRole('button', { name: '最初から', exact: true }).click();
  await expect(page.locator('.upgrade-item.acquired')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 }); await fits(page);
  await page.screenshot({ path: 'test-results/survivor-mobile.png' }); expect(errors).toEqual([]);
});

test('Wildbloom: three upgrade choices pause play, retain queued rewards and reset on retry', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(url); await expect(page.locator('.world-canvas canvas')).toBeVisible();
  await page.evaluate(async () => {
    const { World } = await import('/src/World.js'); const start = World.prototype.start; let seeded = false;
    World.prototype.start = function () {
      start.call(this); window.testWorld = this;
      if (!seeded) { seeded = true; this.state.xp = 19;
        for (let i = 0; i < 2; i++) this.state.items.push({ id: ++this.state.id, x: this.state.player.x, z: this.state.player.z, kind: 'upgrade', life: 30 });
      }
    };
  });
  await page.getByRole('button', { name: 'ゲーム開始', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '強化を選択' })).toBeVisible();
  await expect(page.locator('.upgrade-choices button')).toHaveCount(3);
  await expect(page.locator('.upgrade-title')).toContainText('残り 4 回');
  const before = await page.evaluate(() => ({ time: window.testWorld.state.time, x: window.testWorld.state.player.x }));
  await page.keyboard.down('d'); await page.waitForTimeout(300); await page.keyboard.up('d');
  expect(await page.evaluate(() => ({ time: window.testWorld.state.time, x: window.testWorld.state.player.x }))).toEqual(before);
  await page.screenshot({ path: 'test-results/survivor-upgrade.png' });
  await page.keyboard.press('1'); await expect(page.locator('.upgrade-title')).toContainText('残り 3 回');
  await page.keyboard.press('2'); await page.locator('.upgrade-choices button').nth(2).click();
  await page.keyboard.press('1'); await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('.upgrade-item.acquired')).toHaveCount(3);
  expect(await page.evaluate(() => window.testWorld.state.build)).toEqual(['power','mobility','guard','power']);
  await page.keyboard.down('d'); await page.waitForTimeout(300); await page.keyboard.up('d');
  expect(await page.evaluate(() => window.testWorld.state.time)).toBeGreaterThan(before.time);
  expect(await page.evaluate(() => window.testWorld.state.player.x)).toBeGreaterThan(before.x);
  await page.evaluate(() => { window.testWorld.state.time = 134.85; });
  await expect(page.getByRole('heading', { name: 'クリア', exact: true })).toBeVisible();
  await expect(page.locator('.run-results')).toContainText('02:15'); await page.screenshot({ path: 'test-results/survivor-result.png' });
  await page.getByRole('button', { name: 'もう一度プレイ', exact: true }).click();
  await expect(page.locator('.upgrade-item.acquired')).toHaveCount(0); expect(errors).toEqual([]);
});

test('Wildbloom: HUD, accumulated upgrades and overlays fit desktop, mobile and landscape', async ({ page }) => {
  await page.route('**/src/World.js', route => route.fulfill({ contentType: 'application/javascript', body: `
    import { createRun, snapshot } from '/src/model.js';
    export class World {
      constructor(container, onChange) { this.state = createRun(); this.onChange = onChange;
        window.hudFixture = patch => { Object.assign(this.state, patch); onChange(snapshot(this.state)); }; onChange(snapshot(this.state)); }
      pause() { this.state.status = this.state.status === 'playing' ? 'paused' : 'playing'; this.onChange(snapshot(this.state)); }
      dispose() {} }
  ` }));
  await page.goto(url);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 600 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 375, height: 667 }, { width: 320, height: 568 }, { width: 844, height: 390 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(viewport);
    for (const status of ['ready', 'playing', 'paused', 'lost', 'won', 'upgrade']) {
      await page.evaluate(async status => {
        const { UPGRADES } = await import('/src/model.js');
        window.hudFixture({ status, kills: 12345, level: 99, xp: 123, nextXp: 1234, pendingUpgrades: 1, build: Array.from({ length: 99 }, () => 'guard') });
      }, status);
      if ([320, 667].includes(viewport.width) && ['ready', 'won'].includes(status)) await page.screenshot({ path: `test-results/survivor-layout-${viewport.width}-${status}.png` });
      await fits(page);
      if (status === 'upgrade') {
        await expect(page.getByRole('dialog', { name: '強化を選択' })).toBeVisible();
        for (const button of await page.locator('.upgrade-choices button').all()) { const box=await button.boundingBox(); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y+box.height).toBeLessThanOrEqual(viewport.height); }
        expect(await page.locator('.upgrade-dialog').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
      }
    }
    await page.evaluate(()=>window.hudFixture({status:'won'}));
    await page.getByRole('button', { name: '操作方法', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '操作方法' })).toBeVisible();
    const close = await page.getByRole('button', { name: '操作方法を閉じる' }).boundingBox();
    expect(close.y + close.height).toBeLessThanOrEqual(viewport.height);
    await page.getByRole('button', { name: '操作方法を閉じる' }).click();
  }
});

test('Wildbloom: touch movement and dash remain usable', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage(); await page.goto(url);
  await page.getByRole('button', { name: 'ゲーム開始' }).tap();
  await expect(page.locator('.joystick')).toBeVisible();
  const box = await page.locator('.joystick').boundingBox();
  await page.touchscreen.tap(box.x + box.width * .75, box.y + box.height / 2);
  const dash = await page.getByRole('button', { name: '回避する' }).boundingBox();
  await page.mouse.move(dash.x + dash.width / 2, dash.y + dash.height / 2); await page.mouse.down();
  await expect(page.locator('.dash-status')).not.toContainText('準備完了');
  await page.mouse.up();
  await fits(page); await page.screenshot({ path: 'test-results/survivor-touch.png' }); await context.close();
});

test('Wildbloom: terrain, walls, charged attacks and dense final-phase rendering', async ({ page }) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await expect(page.locator('.world-canvas canvas')).toBeVisible();
  await page.evaluate(async()=>{
    const {World}=await import('/src/World.js');const start=World.prototype.start;
    World.prototype.start=function(){start.call(this);window.testWorld=this;};
  });
  await page.getByRole('button',{name:'ゲーム開始',exact:true}).click();
  await page.evaluate(async()=>{
    const {spawnEnemy}=await import('/src/model.js');const s=window.testWorld.state;
    s.time=95;s.phase=2;s.player.invincible=999;s.spawnTimer=s.itemTimer=s.shotTimer=999;
    for(let i=0;i<60;i++){const a=i*2.39996;spawnEnemy(s,i%3?'runner':'ranger',{x:Math.cos(a)*(9+i%8),z:Math.sin(a)*(9+i%8)});const e=s.enemies.at(-1);e.warmup=0;e.windup=.8;e.aimX=-Math.cos(a);e.aimZ=-Math.sin(a);}
  });
  await expect.poll(()=>page.evaluate(()=>[...window.testWorld.objects.keys()].filter(k=>k.startsWith('warning')).length)).toBeGreaterThan(20);
  await page.screenshot({path:'test-results/survivor-field.png'});
  await page.waitForTimeout(500);
  await expect.poll(()=>page.evaluate(()=>window.testWorld.state.bolts.length)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
