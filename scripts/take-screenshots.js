const { chromium } = require('playwright');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'https://agentaudit-api-production.up.railway.app';
const OUT_DIR = path.join(__dirname, '..', 'docs', 'assets');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // retina for crisp README images
  });

  // ── Landing Page Hero ────────────────────────────────────────────
  console.log('Capturing landing page hero...');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500); // let canvas animations settle
  await page.screenshot({
    path: path.join(OUT_DIR, 'landing-hero.png'),
    fullPage: false,
  });
  console.log('  → docs/assets/landing-hero.png');

  // ── Trace Visualizer ─────────────────────────────────────────────
  console.log('Capturing trace visualizer...');
  await page.goto(`${BASE_URL}/trace-visualizer.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(OUT_DIR, 'trace-visualizer.png'),
    fullPage: false,
  });
  console.log('  → docs/assets/trace-visualizer.png');

  await browser.close();
  console.log('\nDone! Commit the updated PNGs with:');
  console.log('  git add docs/assets/*.png && git commit -m "docs: update README screenshots"');
})();
