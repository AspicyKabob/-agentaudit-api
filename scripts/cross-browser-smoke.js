// Cross-browser visual smoke test.
// Requires Playwright to be installed manually (npm install -D playwright) before running.
const { chromium, firefox, webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'https://agentaudit.online';
const PAGES = ['/', '/pricing.html', '/docs.html', '/security.html', '/privacy.html', '/terms.html'];
const BROWSERS = [
  { name: 'chromium', launch: chromium },
  { name: 'firefox', launch: firefox },
  { name: 'webkit', launch: webkit },
];
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];

const OUTPUT_DIR = path.join(__dirname, '..', 'tmp', 'cross-browser');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function run() {
  const results = [];
  let failed = false;

  for (const browserDef of BROWSERS) {
    let browser;
    try {
      browser = await browserDef.launch.launch({ headless: true });
    } catch (err) {
      console.error(`Failed to launch ${browserDef.name}: ${err.message}`);
      results.push({ browser: browserDef.name, status: 'launch-failed', error: err.message });
      failed = true;
      continue;
    }

    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();

      for (const pagePath of PAGES) {
        const url = `${BASE_URL}${pagePath}`;
        const testKey = `${browserDef.name}-${viewport.name}-${pagePath.replace(/\//g, '-') || 'home'}`;
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(500);

          const { innerWidth, scrollWidth, title } = await page.evaluate(() => ({
            innerWidth: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            title: document.title,
          }));

          const overflow = scrollWidth > innerWidth + 1;
          const screenshotPath = path.join(OUTPUT_DIR, `${testKey}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: true });

          let hamburgerVisible = false;
          let menuOpened = false;
          let modalOpened = false;

          if (viewport.name === 'mobile') {
            const toggle = await page.$('#nav-toggle[aria-expanded="false"], .nav-toggle');
            if (toggle) {
              hamburgerVisible = await toggle.evaluate(el => window.getComputedStyle(el).display !== 'none');
            }

            if (hamburgerVisible) {
              await page.evaluate(() => document.getElementById('nav-toggle').click());
              await page.waitForTimeout(400);

              menuOpened = await page.evaluate(() => {
                const menu = document.getElementById('mobile-nav');
                return menu && menu.classList.contains('is-open') && window.getComputedStyle(menu).display !== 'none';
              });

              if (menuOpened) {
                const login = page.locator('#mobile-nav a', { hasText: 'Log In' }).first();
                if ((await login.count()) > 0) {
                  await login.click({ force: true });
                  await page.waitForTimeout(500);

                  modalOpened = await page.evaluate(() => {
                    const modal = document.getElementById('auth-modal');
                    return modal && modal.classList.contains('active') && window.getComputedStyle(modal).display !== 'none';
                  });
                }
              }
            }
          }

          results.push({
            browser: browserDef.name,
            viewport: viewport.name,
            page: pagePath,
            url,
            title,
            innerWidth,
            scrollWidth,
            overflow,
            hamburgerVisible,
            menuOpened,
            modalOpened,
            screenshot: screenshotPath,
            status: 'ok',
          });

          if (overflow) {
            console.error(`Overflow detected: ${testKey} (${scrollWidth} > ${innerWidth})`);
            failed = true;
          }

          if (viewport.name === 'mobile' && !menuOpened) {
            console.warn(`Mobile menu did not open on ${testKey}`);
          }
        } catch (err) {
          console.error(`Error on ${testKey}: ${err.message}`);
          results.push({ browser: browserDef.name, viewport: viewport.name, page: pagePath, url, status: 'error', error: err.message });
          failed = true;
        }
      }

      await context.close();
    }

    await browser.close();
  }

  const reportPath = path.join(OUTPUT_DIR, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

  console.log(`\nCross-browser smoke test complete. Report: ${reportPath}`);
  console.log(`Screenshots: ${OUTPUT_DIR}`);

  if (failed) {
    console.error('Some checks failed; see report for details.');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
