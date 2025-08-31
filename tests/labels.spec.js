const { test, expect } = require('@playwright/test');

test('labels render without excessive overlaps at default seed', async ({ page }) => {
  await page.goto('http://localhost:8000/index.html');
  await page.waitForSelector('#labels-overlay', { timeout: 15000 });

  async function getBBoxes(selector) {
    return await page.$$eval(selector, nodes => nodes.map(n => {
      const r = n.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }));
  }

  const overlayBoxes = await getBBoxes('#labels-overlay text');
  const oceanBoxes = await getBBoxes('#labels-world text.ocean');
  const boxes = overlayBoxes.concat(oceanBoxes);

  const overlaps = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);

  let overlapCount = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (overlaps(boxes[i], boxes[j])) overlapCount++;
    }
  }
  expect(overlapCount).toBeLessThan(40);
});

test('zoom counter-scaling keeps font sizes stable', async ({ page }) => {
  await page.goto('http://localhost:8000/index.html');
  await page.waitForSelector('#labels-overlay');

  const label = page.locator('#labels-overlay text').first();
  await expect(label).toBeVisible();

  const size1 = await label.evaluate(n => parseFloat(getComputedStyle(n).fontSize));
  await page.mouse.wheel(0, -800); // zoom in
  await page.waitForTimeout(400);
  const size2 = await label.evaluate(n => parseFloat(getComputedStyle(n).fontSize));

  expect(Math.abs(size2 - size1)).toBeLessThan(1.0);
});
