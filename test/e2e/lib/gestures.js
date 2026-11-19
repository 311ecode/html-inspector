// test/e2e/lib/gestures.js — the FAB drag-copy gesture and the clipboard read,
// shared by the embed and extension specs.
'use strict';

/** Press the FAB, drag it over (x, y), release — the DASH-065 pull-the-FAB gesture. */
async function dragFabTo(page, x, y) {
    const fab = page.locator('#fab');
    const box = await fab.boundingBox();
    if (!box) throw new Error('gesture: #fab has no bounding box');
    const sx = box.x + box.width / 2;
    const sy = box.y + box.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx - 120, sy, { steps: 5 }); // clear the tap-vs-drag threshold
    await page.mouse.move(x, y, { steps: 10 });
    await page.mouse.up();
}

async function readClipboard(page) {
    return page.evaluate(() => navigator.clipboard.readText());
}

module.exports = { dragFabTo, readClipboard };
