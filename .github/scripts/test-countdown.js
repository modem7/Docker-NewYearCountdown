// Verifies the countdown actually ticks down and rolls over to "Happy New
// Year!" at midnight, not just that the page returns 200. Uses Playwright's
// Clock API (page.clock) to fake the browser's Date/setInterval a few
// seconds before a Jan 1st rollover, since we can't wait for a real New
// Year's Eve in CI.
const { chromium } = require('playwright');

const BASE_URL = process.argv[2] || 'http://localhost:8080';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  // 5 seconds before the next Jan 1st 00:00:00, local time - matches the
  // page's own `new Date(nextYear + "/1/1")` target calculation.
  const now = new Date();
  const targetYear = now.getFullYear() + 1;
  const rollover = new Date(targetYear, 0, 1, 0, 0, 0, 0);
  const preRollover = new Date(rollover.getTime() - 5000);
  // Install well before preRollover (30s of buffer) so a slow page load never
  // eats into the 5s pre-rollover window we actually assert against.
  const installTime = new Date(rollover.getTime() - 30000);

  // After install(), Playwright's fake clock flows in real wall-clock time
  // during page load (see https://playwright.dev/docs/clock -
  // "Consistent time and timers"), so how long the load takes is not
  // deterministic. Snapping to preRollover via pauseAt() *after* load
  // finishes - the pattern the Playwright docs recommend - pins the clock to
  // exactly 5s before rollover regardless of load time, making the
  // assertion below deterministic instead of racing page-load time against
  // a 5s window.
  await page.clock.install({ time: installTime });
  await page.goto(`${BASE_URL}/countdown.html`, { waitUntil: 'load' });
  await page.clock.pauseAt(preRollover);

  await page.waitForFunction(
    () => document.getElementById('cd-secs').textContent !== '??',
    { timeout: 10000 },
  );

  const secsBefore = await page.locator('#cd-secs').innerText();
  if (Number(secsBefore) > 5) {
    throw new Error(`Expected countdown to show <=5 seconds remaining before rollover, got "${secsBefore}"`);
  }

  const titleBefore = await page.locator('#cd-title').innerText();
  if (!titleBefore.includes(String(targetYear))) {
    throw new Error(`Expected title to include target year ${targetYear}, got "${titleBefore}"`);
  }

  // Fast forward the faked clock past midnight - the page's own
  // setInterval(..., 1000) callback fires against the new time as if the
  // laptop lid had been closed and reopened past New Year.
  await page.clock.fastForward(8000);

  await page.waitForFunction(
    () => document.getElementById('cd-title').textContent === 'Happy New Year!',
    { timeout: 10000 },
  );

  const titleClass = await page.locator('#cd-title').getAttribute('class');
  if (!titleClass || !titleClass.includes('cd__title--newyear')) {
    throw new Error(`Expected #cd-title to have class "cd__title--newyear", got "${titleClass}"`);
  }

  if (consoleErrors.length > 0) {
    throw new Error(`Console errors detected:\n${consoleErrors.join('\n')}`);
  }

  await browser.close();
  console.log('Countdown rollover test passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
