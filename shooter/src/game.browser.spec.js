import { test, expect } from '@playwright/test';

const expectFits = async page => {
  const dimensions = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.height);
  for (const selector of ['.game-viewport', '.score-panel', '.systems-panel', '.flight-actions']) {
    const box = await page.locator(selector).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(dimensions.width);
    expect(box.y + box.height).toBeLessThanOrEqual(dimensions.height);
  }
};

test('Starfall: play, settings, bomb, pause, help and retry', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:3101');
  await expect(page.locator('.phaser-host canvas')).toBeVisible();
  await expect(page.locator('.stage-list li')).toHaveText(['STAGE 1', 'STAGE 2', 'STAGE 3']);
  await page.screenshot({ path: 'test-results/shooter-title.png', fullPage: true });
  const autoFire = page.getByRole('button', { name: /自動射撃/ });
  await autoFire.click();
  await expect(autoFire).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'ゲーム開始', exact: true }).click();
  await expect(page.locator('.flight-overlay')).toHaveCount(0);
  await expect(autoFire).toHaveAttribute('aria-pressed', 'false');
  await autoFire.click();
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowLeft');
  await page.getByRole('button', { name: /ボムを使う/ }).click();
  await expect(page.locator('.bombs .available')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/shooter-playing.png', fullPage: true });
  await page.getByRole('button', { name: '一時停止', exact: true }).click();
  await expect(page.getByRole('heading', { name: '一時停止' })).toBeVisible();
  await page.getByRole('button', { name: '操作方法', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('heading', { name: '一時停止' })).toBeVisible();
  await page.locator('.flight-overlay').getByRole('button', { name: '再開する', exact: true }).click();
  await expect(page.locator('.flight-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: '操作方法', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '操作方法を閉じる' }).click();
  await expect(page.locator('.flight-overlay')).toHaveCount(0);
  await page.keyboard.press('p');
  await expect(page.getByRole('heading', { name: '一時停止' })).toBeVisible();
  await page.getByRole('button', { name: '最初から', exact: true }).click();
  await expect(page.locator('.bombs .available')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('Starfall: viewport fits on desktop, mobile and landscape with help', async ({ page }) => {
  await page.goto('http://127.0.0.1:3101');
  await expect(page.locator('.phaser-host canvas')).toBeVisible();
  for (const viewport of [
    { width: 1440, height: 900 }, { width: 1280, height: 720 },
    { width: 1024, height: 600 }, { width: 768, height: 1024 },
    { width: 390, height: 844 }, { width: 375, height: 667 },
    { width: 320, height: 568 }, { width: 844, height: 390 },
    { width: 667, height: 375 },
  ]) {
    await page.setViewportSize(viewport);
    await expectFits(page);
    await page.getByRole('button', { name: '操作方法', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const close = await page.getByRole('button', { name: '操作方法を閉じる' }).boundingBox();
    expect(close.y + close.height).toBeLessThanOrEqual(viewport.height);
    await page.getByRole('button', { name: '操作方法を閉じる' }).click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/shooter-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'ゲーム開始', exact: true }).click();
  await page.keyboard.press('p');
  await expect(page.getByRole('heading', { name: '一時停止' })).toBeVisible();
  await expectFits(page);
});

test('Starfall: transition and result overlays fit in small viewports', async ({ page }) => {
  // Drive HUD states independently of the renderer to cover end-of-run layouts.
  await page.route('**/src/Game.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `import { createGame, snapshot } from '/src/model.js';
      export function mountGame(parent, onChange) {
        window.renderShooterHud = patch => onChange({ ...snapshot(createGame()), ...patch });
        return { destroy() { delete window.renderShooterHud; } };
      }`,
  }));
  await page.goto('http://127.0.0.1:3101');
  for (const viewport of [{ width: 1440, height: 900 }, { width: 320, height: 568 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(viewport);
    for (const status of ['transition', 'lost', 'won']) {
      await page.evaluate(status => window.renderShooterHud({ status, score: 1234567, kills: 999, accuracy: 100 }), status);
      await expect(page.locator('.flight-overlay')).toBeVisible();
      await expectFits(page);
      const overflow = await page.locator('.flight-overlay').evaluate(el => el.scrollHeight - el.clientHeight);
      expect(overflow).toBeLessThanOrEqual(1);
      const frame = await page.locator('.flight-overlay').boundingBox();
      const heading = await page.locator('.flight-overlay h2').boundingBox();
      expect(heading.y).toBeGreaterThanOrEqual(frame.y);
      if (status !== 'transition') {
        const retry = await page.getByRole('button', { name: 'もう一度プレイ' }).boundingBox();
        expect(retry.y + retry.height).toBeLessThanOrEqual(frame.y + frame.height);
      }
      if (status === 'won') await page.screenshot({ path: `test-results/shooter-result-${viewport.width}.png` });
    }
  }
});

test('Starfall: dense authored encounters and all final boss phases render without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Fixtures replace the state inside the real renderer only in this test's response.
  await page.route('**/src/Game.js', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace('create(){sceneRef=this;',
      'create(){sceneRef=this;window.__shooterQA={load(state){gameState=state;}};');
    await route.fulfill({ response, body });
  });
  await page.goto('http://127.0.0.1:3101');
  await expect(page.locator('.phaser-host canvas')).toBeVisible();
  const fixtures = [
    { stage: 1, seconds: 9 }, { stage: 2, seconds: 6 }, { stage: 2, seconds: 10 },
    { stage: 2, phase: 1, seconds: 4 }, { stage: 2, phase: 2, seconds: 12 },
    { stage: 2, phase: 3, seconds: 14 }, { stage: 2, phase: 4, seconds: 18 },
  ];
  for (const fixture of fixtures) {
    const count = await page.evaluate(async fixture => {
      const { createGame, tick, WAVE_DURATIONS } = await import('/src/model.js');
      const { BOSS_PHASE_HP } = await import('/src/choreography.js');
      const s = createGame(() => .5);
      s.stage = fixture.stage; s.status = 'playing'; s.autoFire = false; s.player.invincible = 999;
      if (fixture.phase) {
        s.time = WAVE_DURATIONS[s.stage]; tick(s, 1 / 60); s.boss.y = 125;
        s.boss.phase = fixture.phase;
        s.boss.hp = BOSS_PHASE_HP[s.stage].slice(fixture.phase - 1).reduce((a, b) => a + b, 0);
      }
      for (let i = 0; i < fixture.seconds * 60; i++) tick(s, 1 / 60);
      window.__shooterQA.load(s);
      return s.bullets.length;
    }, fixture);
    expect(count).toBeGreaterThan(70);
    await expect(page.locator('.viewport-label h2')).toHaveText(`STAGE ${fixture.stage + 1}`);
    if (fixture.phase) await expect(page.locator('.boss-hud')).toContainText(`PHASE ${fixture.phase} / 4`);
    await page.screenshot({ path: `test-results/shooter-barrage-${fixture.stage + 1}-${fixture.phase || `wave-${fixture.seconds}`}.png` });
    await expectFits(page);
  }
  expect(errors).toEqual([]);
});


test('Starfall: every debug URL starts and retries its selected checkpoint at full strength', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:3101/debug');
  await expect(page.getByRole('heading', { name: 'デバッグ', exact: true })).toBeVisible();
  const paths = await page.locator('.debug-stages a').evaluateAll(links => links.map(a => a.getAttribute('href')));
  expect(paths).toHaveLength(12);
  for (const path of paths) {
    await page.goto(`http://127.0.0.1:3101${path}`);
    await expect(page.locator('.phaser-host canvas')).toBeVisible();
    await expect(page.locator('.shield-resource strong')).toHaveText('5 / 5');
    await expect(page.locator('.power-resource strong')).toHaveText('3 / 3');
    await expect(page.locator('.bombs .available')).toHaveCount(3);
    const stage = Number(path.match(/(?:stage|boss)\/(\d)/)[1]);
    const phase = path.match(/phase\/(\d)/)?.[1];
    await expect(page.locator('.viewport-label h2')).toHaveText(`STAGE ${stage}`);
    if (phase) await expect(page.locator('.boss-hud')).toContainText(`PHASE ${phase}`);
    else await expect(page.locator('.boss-hud')).toHaveCount(0);
    await page.getByRole('button', { name: 'ゲーム開始', exact: true }).click();
    await page.getByRole('button', { name: /ボムを使う/ }).click();
    await expect(page.locator('.bombs .available')).toHaveCount(2);
    await page.keyboard.press('p');
    await page.getByRole('button', { name: '最初から', exact: true }).click();
    await expect(page.locator('.bombs .available')).toHaveCount(3);
    await expect(page.locator('.viewport-label h2')).toHaveText(`STAGE ${stage}`);
    if (phase) await expect(page.locator('.boss-hud')).toContainText(`PHASE ${phase}`);
  }
  await page.goto('http://127.0.0.1:3101/debug/boss/3/phase/9');
  await expect(page.getByRole('alert')).toHaveText('開始位置が見つかりません。');
  expect(errors).toEqual([]);
});
