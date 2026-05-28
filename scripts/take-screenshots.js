const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  
  await page.goto('https://agentaudit-api-production.up.railway.app/');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'screenshots/landing-hero.png', fullPage: false });
  await page.screenshot({ path: 'screenshots/landing-full.png', fullPage: true });
  
  await page.goto('https://agentaudit-api-production.up.railway.app/trace-visualizer.html');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/trace-visualizer.png', fullPage: false });
  
  await browser.close();
  console.log('Screenshots saved!');
})();
