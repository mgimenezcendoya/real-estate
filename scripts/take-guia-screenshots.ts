/**
 * REALIA — Guía screenshot capture script
 *
 * Takes screenshots of each production page and saves them to frontend/public/guia/.
 *
 * Usage:
 *   REALIA_EMAIL=your@email.com REALIA_PASSWORD=yourpass REALIA_PROJECT_ID=<uuid> \
 *     npx ts-node --esm scripts/take-guia-screenshots.ts
 *
 * Requirements:
 *   npm install --save-dev playwright
 *   npx playwright install chromium
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = 'https://realia-production-318c.up.railway.app';
const OUT_DIR = path.resolve(__dirname, '../frontend/public/guia');

const EMAIL = process.env.REALIA_EMAIL;
const PASSWORD = process.env.REALIA_PASSWORD;
const PROJECT_ID = process.env.REALIA_PROJECT_ID;

if (!EMAIL || !PASSWORD || !PROJECT_ID) {
  console.error('Missing required env vars: REALIA_EMAIL, REALIA_PASSWORD, REALIA_PROJECT_ID');
  process.exit(1);
}

interface Shot {
  name: string;
  url: string;
  waitFor?: string;
  waitMs?: number;
}

const SHOTS: Shot[] = [
  { name: 'login',         url: '/',                                    waitFor: 'form',   waitMs: 500 },
  { name: 'proyectos',     url: '/proyectos',                           waitMs: 1500 },
  { name: 'dashboard',     url: `/proyectos/${PROJECT_ID}`,             waitMs: 1500 },
  { name: 'leads',         url: `/proyectos/${PROJECT_ID}/leads`,       waitMs: 1500 },
  { name: 'unidades',      url: `/proyectos/${PROJECT_ID}/unidades`,    waitMs: 1500 },
  { name: 'reservas',      url: `/proyectos/${PROJECT_ID}/reservas`,    waitMs: 1500 },
  { name: 'obra',          url: `/proyectos/${PROJECT_ID}/obra`,        waitMs: 1500 },
  { name: 'financiero',    url: `/proyectos/${PROJECT_ID}/financiero`,  waitMs: 1500 },
  { name: 'inversores',    url: `/proyectos/${PROJECT_ID}/inversores`,  waitMs: 1500 },
  { name: 'inbox',         url: '/inbox',                               waitMs: 2000 },
  { name: 'tools',         url: '/tools',                               waitMs: 1000 },
  { name: 'usuarios',      url: '/admin/usuarios',                      waitMs: 1000 },
  { name: 'configuracion', url: '/configuracion',                       waitMs: 1000 },
];

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Output directory: ${OUT_DIR}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2, // Retina quality
  });
  const page = await context.newPage();

  // ── Login ────────────────────────────────────────────────────────────
  console.log('\nLogging in...');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', EMAIL!);
  await page.fill('input[type="password"]', PASSWORD!);

  // Special: capture login screen BEFORE submitting
  {
    const outPath = path.join(OUT_DIR, 'login.png');
    if (!fs.existsSync(outPath)) {
      await page.screenshot({ path: outPath, fullPage: false });
      console.log('  ✓  login (before submit)');
    } else {
      console.log('  –  login (skipped, exists)');
    }
  }

  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE_URL}/proyectos`, { timeout: 15000 });
  console.log('  ✓  logged in');

  // ── Screenshots ──────────────────────────────────────────────────────
  for (const shot of SHOTS.slice(1)) {
    const outPath = path.join(OUT_DIR, `${shot.name}.png`);
    if (fs.existsSync(outPath)) {
      console.log(`  –  ${shot.name} (skipped, exists)`);
      continue;
    }
    try {
      await page.goto(`${BASE_URL}${shot.url}`, { waitUntil: 'networkidle', timeout: 20000 });
      if (shot.waitFor) {
        await page.waitForSelector(shot.waitFor, { timeout: 8000 }).catch(() => {});
      }
      if (shot.waitMs) {
        await page.waitForTimeout(shot.waitMs);
      }
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`  ✓  ${shot.name}`);
    } catch (e) {
      console.error(`  ✗  ${shot.name}: ${(e as Error).message}`);
    }
  }

  await browser.close();
  console.log(`\nDone. ${SHOTS.length} screenshots in ${OUT_DIR}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
