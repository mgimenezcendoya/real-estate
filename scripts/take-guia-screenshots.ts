/**
 * REALIA — Guía screenshot capture script
 *
 * Takes screenshots of each production page and saves them to frontend/public/guia/.
 *
 * Usage:
 *   REALIA_TOKEN=<jwt> REALIA_PROJECT_ID=<uuid> \
 *     npx ts-node --esm scripts/take-guia-screenshots.ts
 *
 * Get a token via Python:
 *   python3 -c "
 *   import urllib.request, json, os
 *   data = json.dumps({'username': 'your@email.com', 'password': 'yourpass'}).encode()
 *   req = urllib.request.Request('https://realia-production-318c.up.railway.app/admin/auth/login',
 *     data=data, headers={'Content-Type':'application/json'}, method='POST')
 *   with urllib.request.urlopen(req) as r:
 *     print(json.loads(r.read())['access_token'])
 *   "
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

const BASE_URL = 'https://realia.up.railway.app';
const OUT_DIR = path.resolve(__dirname, '../frontend/public/guia');

const TOKEN = process.env.REALIA_TOKEN;
const PROJECT_ID = process.env.REALIA_PROJECT_ID;

if (!TOKEN || !PROJECT_ID) {
  console.error('Missing required env vars: REALIA_TOKEN, REALIA_PROJECT_ID');
  process.exit(1);
}

interface Shot {
  name: string;
  url: string;
  waitFor?: string;
  waitMs?: number;
  networkIdle?: boolean;
}

const SHOTS: Shot[] = [
  { name: 'login',         url: '/',                                    waitFor: 'form',   waitMs: 500,  networkIdle: false },
  { name: 'proyectos',     url: '/proyectos',                           waitMs: 1500 },
  { name: 'dashboard',     url: `/proyectos/${PROJECT_ID}`,             waitMs: 1500 },
  { name: 'leads',         url: `/proyectos/${PROJECT_ID}/leads`,       waitMs: 1500 },
  { name: 'unidades',      url: `/proyectos/${PROJECT_ID}/unidades`,    waitMs: 1500 },
  { name: 'reservas',      url: `/proyectos/${PROJECT_ID}/reservas`,    waitMs: 1500 },
  { name: 'obra',          url: `/proyectos/${PROJECT_ID}/obra`,        waitMs: 1500 },
  { name: 'financiero',    url: `/proyectos/${PROJECT_ID}/financiero`,  waitMs: 1500 },
  { name: 'inversores',    url: `/proyectos/${PROJECT_ID}/inversores`,  waitMs: 1500 },
  { name: 'inbox',         url: '/inbox',                               waitMs: 2000,  networkIdle: false },
  { name: 'tools',         url: '/tools',                               waitMs: 1000 },
  { name: 'usuarios',      url: '/admin/usuarios',                      waitMs: 1000 },
  { name: 'configuracion', url: '/configuracion',                       waitMs: 1000 },
];

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Output directory: ${OUT_DIR}`);

  // ── Login screen (unauthenticated) ───────────────────────────────────
  {
    const outPath = path.join(OUT_DIR, 'login.png');
    const browser0 = await chromium.launch({ headless: true });
    const ctx0 = await browser0.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
    const page0 = await ctx0.newPage();
    await page0.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await page0.waitForSelector('form', { timeout: 8000 }).catch(() => {});
    await page0.waitForTimeout(500);
    await page0.screenshot({ path: outPath, fullPage: false });
    console.log('  ✓  login');
    await browser0.close();
  }

  // ── Authenticated screenshots ─────────────────────────────────────────
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });

  // Inject token into sessionStorage BEFORE any React hydration
  await context.addInitScript((t) => {
    sessionStorage.setItem('realia_token', t);
  }, TOKEN!);

  const page = await context.newPage();

  // Warm up: navigate to /proyectos to confirm auth works
  console.log('\nVerifying auth...');
  await page.goto(`${BASE_URL}/proyectos`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForSelector('aside', { timeout: 15000 });
  console.log('  ✓  authenticated');

  for (const shot of SHOTS.slice(1)) {
    const outPath = path.join(OUT_DIR, `${shot.name}.png`);
    try {
      const waitUntil = shot.networkIdle === false ? 'load' : 'networkidle';
      await page.goto(`${BASE_URL}${shot.url}`, { waitUntil, timeout: 25000 });
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
