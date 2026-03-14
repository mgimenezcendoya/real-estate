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

const BASE_URL = 'https://realia.up.railway.app';
const OUT_DIR = path.resolve(__dirname, '../frontend/public/guia');

const EMAIL = process.env.REALIA_EMAIL;
const PASSWORD = process.env.REALIA_PASSWORD;
const PROJECT_ID = process.env.REALIA_PROJECT_ID;
const PREAUTH_TOKEN = process.env.REALIA_TOKEN; // Optional: skip login form entirely

if (!PROJECT_ID) {
  console.error('Missing required env var: REALIA_PROJECT_ID');
  process.exit(1);
}
if (!PREAUTH_TOKEN && (!EMAIL || !PASSWORD)) {
  console.error('Missing required env vars: REALIA_TOKEN or (REALIA_EMAIL + REALIA_PASSWORD)');
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
  { name: 'inbox',         url: '/inbox',                               waitMs: 3000, waitUntil: 'load' },
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

  // ── Capture login screen first (before auth) ─────────────────────────
  console.log('\nCapturing login screen...');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#username', { timeout: 15000 });
  {
    const outPath = path.join(OUT_DIR, 'login.png');
    if (!fs.existsSync(outPath)) {
      await page.screenshot({ path: outPath, fullPage: false });
      console.log('  ✓  login');
    } else {
      console.log('  –  login (skipped, exists)');
    }
  }

  // ── Auth: use pre-fetched token or API login ──────────────────────────
  let token: string;
  if (PREAUTH_TOKEN) {
    token = PREAUTH_TOKEN;
    console.log(`\nUsing pre-fetched token (${token.length} chars)`);
  } else {
    console.log('\nAuthenticating via API...');
    const API_URL = 'https://realia-production-318c.up.railway.app';
    const loginResp = await fetch(`${API_URL}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: EMAIL, password: PASSWORD }),
    });
    if (!loginResp.ok) {
      throw new Error(`Login API failed: ${loginResp.status} ${await loginResp.text()}`);
    }
    const loginData = await loginResp.json() as { token: string };
    token = loginData.token;
    console.log(`  ✓  got JWT token (${token.length} chars)`);
  }

  // Inject token via addInitScript so sessionStorage is set BEFORE React hydrates
  await context.addInitScript((t) => {
    sessionStorage.setItem('realia_token', t);
  }, token);

  // Navigate and wait for sidebar (authenticated render)
  await page.goto(`${BASE_URL}/proyectos`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT_DIR, '_debug_auth.png') });
  console.log(`  debug url after token inject: ${page.url()}`);
  await page.waitForSelector('aside', { timeout: 15000 });
  await page.waitForTimeout(1000);
  console.log(`  ✓  logged in → ${page.url()}`);

  // ── Screenshots ──────────────────────────────────────────────────────
  for (const shot of SHOTS.slice(1)) {
    const outPath = path.join(OUT_DIR, `${shot.name}.png`);
    if (fs.existsSync(outPath)) {
      console.log(`  –  ${shot.name} (skipped, exists)`);
      continue;
    }
    try {
      const waitUntil = (shot as { waitUntil?: 'load' | 'networkidle' }).waitUntil ?? 'networkidle';
      await page.goto(`${BASE_URL}${shot.url}`, { waitUntil, timeout: 20000 });
      // Wait for sidebar (confirms authenticated render, not login redirect)
      await page.waitForSelector('aside', { timeout: 10000 }).catch(() => {});
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
