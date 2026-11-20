import {test,expect} from '@playwright/test';
test('Gomoku: all difficulties reply, candidate evaluations render, history and undo work',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:3100');
  await expect(page.getByRole('heading',{name:'五目並べ',exact:true})).toBeVisible();
  for(const difficulty of ['Easy','Normal','Hard']){
    await page.getByRole('button',{name:difficulty,exact:true}).click();
    await page.getByRole('button',{name:'H8 空点',exact:true}).click();
    await expect(page.locator('.stone')).toHaveCount(2);
    await expect(page.getByLabel('候補手と評価値')).toBeVisible();
  }
  await page.screenshot({path:'test-results/gomoku-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'一手前へ',exact:true}).click();await expect(page.locator('.stone')).toHaveCount(1);
  await page.getByRole('button',{name:'最新へ',exact:true}).click();await expect(page.locator('.stone')).toHaveCount(2);
  await page.getByRole('button',{name:'一手戻す',exact:true}).click();await expect(page.locator('.stone')).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.board')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.screenshot({path:'test-results/gomoku-mobile.png',fullPage:true});
  expect(errors).toEqual([]);
});
test('Gomoku: restarting during AI calculation cancels stale moves',async({page})=>{
  await page.goto('http://127.0.0.1:3100');await page.getByRole('button',{name:'Hard',exact:true}).click();await page.getByRole('button',{name:'H8 空点',exact:true}).click();await page.getByRole('button',{name:'新しい対局',exact:true}).click();await expect(page.locator('.stone')).toHaveCount(0);await page.waitForTimeout(1200);await expect(page.locator('.stone')).toHaveCount(0);
});


test('Gomoku: thinking toggle hides evaluations and board candidates throughout play', async ({ page }) => {
  await page.goto('http://127.0.0.1:3100');
  await page.getByRole('button', { name: 'H8 空点', exact: true }).click();
  await expect(page.locator('.stone')).toHaveCount(2);
  await expect(page.getByLabel('候補手と評価値')).toBeVisible();
  const toggle = page.getByRole('checkbox', { name: '思考をのぞく' });
  await toggle.uncheck();
  await expect(page.locator('.thought-content')).toHaveCount(0);
  await expect(page.locator('.evaluation-score')).toHaveCount(0);
  await expect(page.locator('.candidate')).toHaveCount(0);
  await page.getByRole('button', { name: '新しい対局', exact: true }).click();
  await page.getByRole('button', { name: 'H8 空点', exact: true }).click();
  await expect(page.locator('.stone')).toHaveCount(2);
  await expect(page.locator('.evaluation-score')).toHaveCount(0);
  await toggle.check();
  await expect(page.getByLabel('候補手と評価値')).toBeVisible();
  await page.getByRole('button', { name: '一手前へ', exact: true }).click();
  await expect(page.getByLabel('候補手と評価値')).toHaveCount(0);
  await page.getByRole('slider', { name: '棋譜の手数' }).fill('0');
  await expect(page.locator('.stone')).toHaveCount(0);
});

test('Gomoku: board and controls fit desktop, mobile and landscape without scrolling', async ({ page }) => {
  await page.goto('http://127.0.0.1:3100');
  await page.getByRole('button', { name: 'H8 空点', exact: true }).click();
  await expect(page.locator('.stone')).toHaveCount(2);
  for (const [width, height] of [[1440, 900], [1280, 720], [1024, 600], [768, 1024], [390, 844], [375, 667], [320, 568], [844, 390], [667, 375]]) {
    await page.setViewportSize({ width, height });
    for (const show of [true, false]) {
      await page.getByRole('checkbox', { name: '思考をのぞく' }).setChecked(show);
      const layout = await page.evaluate(() => {
        const elements = [...document.querySelectorAll('.board-frame, .board, .game-header, .side-panel button, .switch, .history-slider, .candidate-row')];
        return {
          noScroll: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
          allInView: elements.every(element => { const r = element.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; }),
          boardRatio: document.querySelector('.board').getBoundingClientRect().width / document.querySelector('.board').getBoundingClientRect().height,
        };
      });
      expect(layout.noScroll, `${width}×${height}, thinking ${show}`).toBe(true);
      expect(layout.allInView, `${width}×${height}, thinking ${show}`).toBe(true);
      expect(layout.boardRatio).toBeCloseTo(1, 2);
    }
  }
});
