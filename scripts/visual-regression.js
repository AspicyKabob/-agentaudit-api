#!/usr/bin/env node
/**
 * Visual regression baseline for the public website and dashboard states.
 *
 *   node scripts/visual-regression.js --update   # refresh baselines
 *   node scripts/visual-regression.js            # compare against baselines
 *
 * Captures every public page at desktop and mobile widths with animations
 * frozen (deterministic screenshots), then pixel-diffs against baselines
 * committed under tests/visual-baseline/. A page fails when more than
 * MAX_DIFF_RATIO of pixels change.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch').default || require('pixelmatch');

const ROOT = path.join(__dirname, '..');
const WEBSITE_DIR = path.join(ROOT, 'website');
const BASELINE_DIR = path.join(ROOT, 'tests', 'visual-baseline');
const REPORT_DIR = path.join(ROOT, 'tmp', 'visual-regression');

const MAX_DIFF_RATIO = 0.005; // 0.5% of pixels may differ
const PORT = 3470;
const UPDATE = process.argv.includes('--update');

const PAGES = [
  'index.html',
  'features.html',
  'pricing.html',
  'docs.html',
  'trace-visualizer.html',
  'integrations.html',
  'security.html',
  'privacy.html',
  'terms.html',
  'acceptable-use.html',
  'data-retention.html',
];

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'mobile', width: 390, height: 844 },
];

function serve() {
  const server = http.createServer((req, res) => {
    const rel = req.url === '/' ? 'index.html' : req.url.split('?')[0].split('#')[0];
    const filePath = path.join(WEBSITE_DIR, rel);
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      const ct = {
        '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
        '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
      }[path.extname(filePath)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': ct });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

async function capture(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  // Freeze animations/canvas for deterministic captures
  await page.addStyleTag({
    content: `
      *, *::before, *::after { animation: none !important; transition: none !important; }
      #bg-canvas, .hero-glow { display: none !important; }
    `,
  });
  await page.waitForTimeout(300);
  return page.screenshot({ fullPage: true });
}

function compare(name, currentBuffer) {
  const baselinePath = path.join(BASELINE_DIR, `${name}.png`);
  if (!fs.existsSync(baselinePath)) {
    return { status: 'missing', name };
  }
  const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
  const current = PNG.sync.read(currentBuffer);
  if (baseline.width !== current.width || baseline.height !== current.height) {
    fs.writeFileSync(path.join(REPORT_DIR, `${name}.actual.png`), currentBuffer);
    return { status: 'size-mismatch', name, expected: `${baseline.width}x${baseline.height}`, actual: `${current.width}x${current.height}` };
  }
  const diff = new PNG({ width: baseline.width, height: baseline.height });
  const diffPixels = pixelmatch(baseline.data, current.data, diff.data, baseline.width, baseline.height, { threshold: 0.15 });
  const ratio = diffPixels / (baseline.width * baseline.height);
  if (ratio > MAX_DIFF_RATIO) {
    fs.writeFileSync(path.join(REPORT_DIR, `${name}.diff.png`), PNG.sync.write(diff));
    fs.writeFileSync(path.join(REPORT_DIR, `${name}.actual.png`), currentBuffer);
    return { status: 'fail', name, ratio: (ratio * 100).toFixed(2) + '%', diffPixels };
  }
  return { status: 'pass', name, ratio: (ratio * 100).toFixed(3) + '%' };
}

(async () => {
  fs.mkdirSync(BASELINE_DIR, { recursive: true });
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const vp of VIEWPORTS) {
      const page = await (await browser.newContext({ viewport: { width: vp.width, height: vp.height } })).newPage();
      for (const file of PAGES) {
        const name = `${vp.name}-${file.replace('.html', '')}`;
        const shot = await capture(page, `http://127.0.0.1:${PORT}/${file}`);
        if (UPDATE) {
          fs.writeFileSync(path.join(BASELINE_DIR, `${name}.png`), shot);
          results.push({ name, status: 'baseline' });
        } else {
          results.push(compare(name, shot));
        }
      }
      await page.context().close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  for (const r of results) {
    const extra = [r.ratio, r.expected && `expected ${r.expected}`, r.actual && `actual ${r.actual}`].filter(Boolean).join(' | ');
    console.log(`${r.status.toUpperCase().padEnd(14)} ${r.name}${extra ? '  ' + extra : ''}`);
  }

  if (UPDATE) {
    console.log(`\nBaselines written to ${path.relative(ROOT, BASELINE_DIR)}`);
    return;
  }
  const failures = results.filter((r) => r.status !== 'pass');
  if (failures.length) {
    console.log(`\n${failures.length} of ${results.length} captures differ from baseline (diffs in ${path.relative(ROOT, REPORT_DIR)})`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length} captures match baselines.`);
})().catch((e) => { console.error('FAIL:', e); process.exit(1); });
