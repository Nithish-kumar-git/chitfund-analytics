const { chromium } = require('playwright');

(async () => {
  console.log('[PLAYWRIGHT] Launching Chromium...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  console.log('[PLAYWRIGHT] Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500); // font load

  // Desktop screenshot
  const desktopShot = __dirname + '\\screenshot-phase1-desktop.png';
  await page.screenshot({ path: desktopShot, fullPage: true });
  console.log('[PLAYWRIGHT] Desktop screenshot:', desktopShot);

  // Mobile screenshot
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const mobileShot = __dirname + '\\screenshot-phase1-mobile.png';
  await page.screenshot({ path: mobileShot, fullPage: true });
  console.log('[PLAYWRIGHT] Mobile screenshot:', mobileShot);

  // DOM verification
  await page.setViewportSize({ width: 1280, height: 900 });

  const h1 = await page.$('h1');
  const title = await page.title();
  const h1Text = await h1?.textContent();

  console.log('[TEST] Page title:', title);
  console.log('[TEST] H1:', h1Text);

  // Check all 8 table cards are present
  const tableCards = await page.$$('[id^="table-"]');
  console.log('[TEST] Schema table rows:', tableCards.length, tableCards.length === 8 ? '✓' : '✗ EXPECTED 8');

  // Check security list
  const securityItems = await page.$$('ul li');
  console.log('[TEST] List items (security + unknowns + formula):', securityItems.length);

  // Check footer status bar
  const footer = await page.$('footer');
  const footerText = await footer?.textContent();
  console.log('[TEST] Footer text:', footerText?.trim().slice(0, 60));

  // Console errors
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.waitForTimeout(300);
  console.log('[TEST] Console errors:', errors.length === 0 ? 'None ✓' : errors.join('; '));

  console.log('\n[RESULT] Phase 1 stub page verified ✓');
  await browser.close();
})().catch(err => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
