# Guía de Onboarding — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the existing `/guia` page into a full interactive onboarding manual with Playwright screenshots, SVG annotations, 4 missing chapters, and a PDF export.

**Architecture:** Keep everything inside the existing `frontend/src/app/guia/page.tsx` + new sibling components. Screenshots are PNGs in `public/guia/` taken by a one-time Playwright script. PDF is triggered via `window.print()` with `@media print` CSS (no backend needed — simpler, no Puppeteer deploy complexity). Mobile sidebar becomes a Sheet drawer.

**Tech Stack:** Next.js App Router, React, Tailwind CSS 4, shadcn Sheet, Playwright (Node.js script), inline SVG overlays.

---

## Current state

Existing file: `frontend/src/app/guia/page.tsx` (759 lines)
Has: 11 sections (Proyectos→Usuarios), WorkflowList, TipCard, RoleNote, sticky sidebar, mobile chip nav, glossary.

**Missing:**
- Chapter "Primeros pasos" (login, roles, cambio de contraseña)
- Chapter "Plan de pagos" (standalone — currently buried inside Reservas)
- Chapter "Portal del comprador" (new feature)
- Chapter "Configuración" (WhatsApp, usuarios, roles)
- HITL/handoff content in Inbox section
- Screenshots on every section
- SVG annotations on screenshots
- PDF export button
- Mobile hamburger sidebar (chip nav is a poor substitute)

---

## Task 1 — Playwright screenshot script

**Files:**
- Create: `scripts/take-guia-screenshots.ts`
- (Output: `frontend/public/guia/*.png`)

**Step 1: Create the script**

```typescript
// scripts/take-guia-screenshots.ts
// Run with: npx ts-node --esm scripts/take-guia-screenshots.ts
// Or: node --loader ts-node/esm scripts/take-guia-screenshots.ts
// Requires: REALIA_EMAIL, REALIA_PASSWORD env vars

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'https://realia-production-318c.up.railway.app';
const OUT_DIR = path.join(process.cwd(), 'frontend/public/guia');

const EMAIL = process.env.REALIA_EMAIL!;
const PASSWORD = process.env.REALIA_PASSWORD!;

// [project_id] must be a real project ID from prod
const PROJECT_ID = process.env.REALIA_PROJECT_ID!;

const SHOTS: Array<{ name: string; url: string; selector?: string; waitFor?: string }> = [
  { name: 'login',            url: '/',                                    selector: 'form' },
  { name: 'proyectos',        url: '/proyectos',                           waitFor: '[data-testid="project-card"], .glass' },
  { name: 'dashboard',        url: `/proyectos/${PROJECT_ID}`,             waitFor: '.glass' },
  { name: 'leads',            url: `/proyectos/${PROJECT_ID}/leads`,       waitFor: '.glass' },
  { name: 'unidades',         url: `/proyectos/${PROJECT_ID}/unidades`,    waitFor: '.glass' },
  { name: 'reservas',         url: `/proyectos/${PROJECT_ID}/reservas`,    waitFor: '.glass' },
  { name: 'obra',             url: `/proyectos/${PROJECT_ID}/obra`,        waitFor: '.glass' },
  { name: 'financiero',       url: `/proyectos/${PROJECT_ID}/financiero`,  waitFor: '.glass' },
  { name: 'inversores',       url: `/proyectos/${PROJECT_ID}/inversores`,  waitFor: '.glass' },
  { name: 'inbox',            url: '/inbox',                               waitFor: '.glass' },
  { name: 'tools',            url: '/tools',                               waitFor: '.glass' },
  { name: 'usuarios',         url: '/admin/usuarios',                      waitFor: '.glass' },
  { name: 'configuracion',    url: '/configuracion',                       waitFor: '.glass' },
  { name: 'change-password',  url: '/',                                    selector: 'form' }, // reuse login
];

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Login
  await page.goto(`${BASE_URL}/`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE_URL}/proyectos`);

  for (const shot of SHOTS) {
    const outPath = path.join(OUT_DIR, `${shot.name}.png`);
    if (fs.existsSync(outPath)) {
      console.log(`  skip  ${shot.name} (exists)`);
      continue;
    }
    try {
      await page.goto(`${BASE_URL}${shot.url}`, { waitUntil: 'networkidle' });
      if (shot.waitFor) {
        await page.waitForSelector(shot.waitFor, { timeout: 10000 }).catch(() => {});
      }
      await page.waitForTimeout(800);
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`  ✓     ${shot.name}`);
    } catch (e) {
      console.error(`  ✗     ${shot.name}: ${e}`);
    }
  }

  await browser.close();
  console.log('\nDone. Screenshots saved to frontend/public/guia/');
}

run();
```

**Step 2: Install playwright if not present**

```bash
cd /Users/mcendoya/repos/real-estate
npm list playwright 2>/dev/null || npm install --save-dev playwright @playwright/test
npx playwright install chromium
```

**Step 3: Run to generate screenshots**

```bash
cd /Users/mcendoya/repos/real-estate
REALIA_EMAIL=your@email.com REALIA_PASSWORD=yourpass REALIA_PROJECT_ID=uuid-here npx ts-node scripts/take-guia-screenshots.ts
```

Verify that `frontend/public/guia/` now contains 13 PNGs.

**Step 4: Commit screenshots + script**

```bash
git add scripts/take-guia-screenshots.ts frontend/public/guia/
git commit -m "feat: playwright screenshot script + initial guia screenshots"
```

---

## Task 2 — AnnotatedScreenshot component

**Files:**
- Create: `frontend/src/components/AnnotatedScreenshot.tsx`

**Step 1: Write the component**

```tsx
// frontend/src/components/AnnotatedScreenshot.tsx
'use client';

import Image from 'next/image';
import { useState } from 'react';

export interface Annotation {
  /** 0–100 percentage of image width */
  x: number;
  /** 0–100 percentage of image height */
  y: number;
  /** Arrow tip coordinates relative to same 0–100 space */
  arrowFromX?: number;
  arrowFromY?: number;
  label: string;
  description?: string;
}

interface Props {
  src: string;
  alt: string;
  annotations?: Annotation[];
  /** Image natural width for aspect ratio */
  width?: number;
  /** Image natural height for aspect ratio */
  height?: number;
}

export default function AnnotatedScreenshot({
  src,
  alt,
  annotations = [],
  width = 1280,
  height = 800,
}: Props) {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-gray-50 not-prose">
      {/* The screenshot */}
      <div className="relative" style={{ aspectRatio: `${width}/${height}` }}>
        <Image
          src={src}
          alt={alt}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 700px"
        />

        {/* SVG overlay */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox={`0 0 100 ${(height / width) * 100}`}
          preserveAspectRatio="none"
        >
          {annotations.map((a, i) => {
            if (!a.arrowFromX || !a.arrowFromY) return null;
            const vbHeight = (height / width) * 100;
            const x2 = (a.x / 100) * 100;
            const y2 = (a.y / 100) * vbHeight;
            const x1 = (a.arrowFromX / 100) * 100;
            const y1 = (a.arrowFromY / 100) * vbHeight;
            return (
              <line
                key={i}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#6366f1"
                strokeWidth="0.5"
                strokeDasharray="2 1"
                opacity={hovered === i ? 1 : 0.7}
              />
            );
          })}
        </svg>

        {/* Numbered callouts */}
        {annotations.map((a, i) => (
          <button
            key={i}
            className="absolute flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-[9px] font-bold shadow-md hover:bg-indigo-700 transition-colors cursor-default z-10 pointer-events-auto"
            style={{
              left: `${a.x}%`,
              top: `${a.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            aria-label={a.label}
          >
            {i + 1}
          </button>
        ))}

        {/* Tooltip on hover */}
        {hovered !== null && annotations[hovered]?.description && (
          <div
            className="absolute z-20 pointer-events-none"
            style={{
              left: `${annotations[hovered].x}%`,
              top: `${annotations[hovered].y}%`,
              transform: 'translate(-50%, -130%)',
            }}
          >
            <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg max-w-[180px] text-center whitespace-pre-wrap">
              <p className="font-semibold mb-0.5">{annotations[hovered].label}</p>
              <p className="opacity-80">{annotations[hovered].description}</p>
            </div>
          </div>
        )}
      </div>

      {/* Caption: numbered legend below */}
      {annotations.length > 0 && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
          <ol className="list-none space-y-1">
            {annotations.map((a, i) => (
              <li key={i} className="flex gap-2 text-xs text-gray-600">
                <span className="flex-shrink-0 w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span><strong className="text-gray-800">{a.label}</strong>{a.description ? ` — ${a.description}` : ''}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify it compiles**

```bash
cd /Users/mcendoya/repos/real-estate/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to AnnotatedScreenshot.

**Step 3: Commit**

```bash
git add frontend/src/components/AnnotatedScreenshot.tsx
git commit -m "feat: AnnotatedScreenshot component with SVG callouts + hover tooltips"
```

---

## Task 3 — PDF export button + print CSS

**Files:**
- Modify: `frontend/src/app/guia/page.tsx`
- Modify: `frontend/src/app/globals.css` (or create `frontend/src/app/guia/print.css`)

**Step 1: Add print CSS to globals.css**

Add at the bottom of `frontend/src/app/globals.css`:

```css
/* ─── Guía print styles ────────────────────────────── */
@media print {
  /* Hide everything that's not the guide content */
  nav, aside, [data-guia-sidebar], [data-guia-mobilenav], [data-guia-header-actions] {
    display: none !important;
  }

  body {
    background: white !important;
  }

  .guia-section {
    break-after: page;
  }

  /* Show all sections even if conditionally rendered */
  [data-guia-admin-only] {
    display: block !important;
  }

  /* Remove shadows and decorative gradients */
  .shadow-sm, .shadow-md {
    box-shadow: none !important;
  }

  /* Print header: flat, no gradient */
  [data-guia-hero] {
    background: #4f46e5 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Footer with page number */
  @page {
    size: A4;
    margin: 20mm;
    @bottom-center {
      content: counter(page);
      font-size: 10pt;
      color: #6b7280;
    }
  }
}
```

**Step 2: Add PDF export button to the guía header**

In `frontend/src/app/guia/page.tsx`, inside the hero `<div>`, after the title/description block, add:

```tsx
<button
  data-guia-header-actions
  onClick={() => window.print()}
  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 border border-white/20 text-white text-xs font-medium hover:bg-white/25 transition-colors print:hidden"
>
  <Download size={13} />
  Descargar PDF
</button>
```

Add `Download` to the existing lucide-react import.

**Step 3: Add `data-guia-section` attribute to each `GuiaSection`**

In the `GuiaSection` component's outer `<section>` element, add `className="guia-section"` and `data-guia-section={id}`.

**Step 4: Build and verify print preview**

```bash
cd /Users/mcendoya/repos/real-estate/frontend && npm run build 2>&1 | tail -20
```

Manually test: open `/guia` in browser, click "Descargar PDF", verify print dialog opens with all sections.

**Step 5: Commit**

```bash
git add frontend/src/app/guia/page.tsx frontend/src/app/globals.css
git commit -m "feat: guia PDF export button + print CSS (A4, page breaks per chapter)"
```

---

## Task 4 — Mobile hamburger sidebar

**Files:**
- Modify: `frontend/src/app/guia/page.tsx`

**Step 1: Replace chip nav with Sheet hamburger drawer**

The current mobile chip nav (`lg:hidden mb-6 -mx-1 overflow-x-auto pb-1`) needs to be replaced with a hamburger button that opens a `Sheet` drawer showing the full sidebar nav.

In `page.tsx`, add at the top of the component (client component needed — file is already server-side, needs `'use client'`):

Check if `page.tsx` already has `'use client'` directive at top. If not, the `GuiaStickyNav` component that uses `useEffect` for active tracking needs to be extracted. Look at lines 1–50 to confirm.

**Step 2: If no `'use client'` at top**, the page is a server component. The hamburger button needs `onClick` so we need either:
- Add `'use client'` to the page
- Or create a new `GuiaMobileNav` client component

Preferred: create `GuiaMobileNav` client component:

```tsx
// frontend/src/app/guia/GuiaMobileNav.tsx
'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';
import GuiaStickyNav from './GuiaStickyNav'; // extract from page.tsx

interface Props {
  sections: Array<{ id: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }>;
}

export default function GuiaMobileNav({ sections }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden mb-6 flex items-center gap-3" data-guia-mobilenav>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            <Menu size={16} />
            Capítulos
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0 pt-safe">
          <div className="p-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Contenidos
            </p>
            <GuiaStickyNav sections={sections} onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
```

Modify `GuiaStickyNav` to accept optional `onNavigate` callback called when a link is clicked.

**Step 3: Update `GuiaPage` to use `GuiaMobileNav` instead of chip nav**

Replace the chip nav block (`<div className="lg:hidden mb-6 ...">`) with:

```tsx
<GuiaMobileNav sections={visibleSections} />
```

**Step 4: Build + check**

```bash
cd /Users/mcendoya/repos/real-estate/frontend && npm run build 2>&1 | tail -20
```

**Step 5: Commit**

```bash
git add frontend/src/app/guia/
git commit -m "feat: guia mobile hamburger sidebar with Sheet drawer"
```

---

## Task 5 — Chapter 1: Primeros pasos

**Files:**
- Modify: `frontend/src/app/guia/page.tsx`

**Step 1: Add to SECTIONS array (prepend as item 0)**

```tsx
{ id: 'primeros-pasos', label: 'Primeros pasos', icon: LogIn },
```

**Step 2: Add section content before the "Proyectos" section**

```tsx
{/* 0 — Primeros pasos */}
<GuiaSection
  id="primeros-pasos"
  icon={LogIn}
  category="Inicio"
  title="Primeros pasos"
  description="Cómo ingresar a REALIA por primera vez, cambiar tu contraseña y entender los roles de usuario."
  sectionNumber={1}
>
  <WorkflowList
    category="Inicio"
    steps={[
      { label: 'Recibí tus credenciales', description: 'El administrador de tu organización te envía el email y contraseña inicial. Guardá este email — es tu usuario permanente.' },
      { label: 'Ingresá a la plataforma', description: 'Abrí el link de acceso. Verás la pantalla de login. Ingresá tu email y contraseña inicial.' },
      { label: 'Cambiá tu contraseña', description: 'Al iniciar sesión por primera vez, REALIA te pedirá que establezcas una contraseña nueva. Es obligatorio antes de continuar.' },
      { label: 'Explorá el panel', description: 'Una vez dentro, el menú lateral izquierdo da acceso a todos los módulos disponibles según tu rol.' },
    ]}
  />
  <AnnotatedScreenshot
    src="/guia/login.png"
    alt="Pantalla de login de REALIA"
    annotations={[
      { x: 50, y: 35, label: 'Campo email', description: 'Ingresá el email que te asignó el admin' },
      { x: 50, y: 52, label: 'Contraseña', description: 'La contraseña inicial es temporaria' },
      { x: 50, y: 68, label: 'Botón ingresar', description: 'Presioná o hacé clic para entrar' },
    ]}
  />
  <TipCard>
    Si olvidás tu contraseña, contactá al administrador de tu organización. REALIA no tiene recuperación de contraseña por email todavía — el admin puede resetearte la clave desde el panel de usuarios.
  </TipCard>

  {/* Roles explanation */}
  <div>
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
      Roles disponibles
    </p>
    <div className="space-y-2">
      {[
        { role: 'Superadmin', color: 'bg-violet-100 text-violet-800', desc: 'Acceso completo a todas las organizaciones. Solo para el equipo REALIA.' },
        { role: 'Admin', color: 'bg-indigo-100 text-indigo-800', desc: 'Gestiona su organización completa: usuarios, proyectos, financiero.' },
        { role: 'Gerente', color: 'bg-blue-100 text-blue-800', desc: 'Accede a todos los proyectos, ventas y financiero. No crea usuarios.' },
        { role: 'Vendedor', color: 'bg-green-100 text-green-800', desc: 'Gestiona sus leads y reservas asignadas. Sin acceso a financiero.' },
        { role: 'Lector', color: 'bg-gray-100 text-gray-700', desc: 'Solo lectura en proyectos y ventas. No puede editar nada.' },
      ].map(({ role, color, desc }) => (
        <div key={role} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${color}`}>{role}</span>
          <p className="text-sm text-gray-600">{desc}</p>
        </div>
      ))}
    </div>
  </div>
</GuiaSection>
```

**Step 3: Add `LogIn` to lucide-react imports**

**Step 4: Add `AnnotatedScreenshot` import**

```tsx
import AnnotatedScreenshot from '@/components/AnnotatedScreenshot';
```

**Step 5: Build**

```bash
cd /Users/mcendoya/repos/real-estate/frontend && npm run build 2>&1 | tail -20
```

**Step 6: Commit**

```bash
git add frontend/src/app/guia/page.tsx
git commit -m "feat: guia chapter 1 Primeros pasos with login screenshot + roles"
```

---

## Task 6 — Chapter: Plan de pagos (standalone)

The existing "Reservas" chapter contains plan de pagos content but it's crowded. Add a dedicated chapter.

**Files:**
- Modify: `frontend/src/app/guia/page.tsx`

**Step 1: Add to SECTIONS array after reservas**

```tsx
{ id: 'plan-pagos', label: 'Plan de pagos', icon: CreditCard },
```

**Step 2: Add section after the Reservas section**

```tsx
{/* Plan de pagos */}
<GuiaSection
  id="plan-pagos"
  icon={CreditCard}
  category="Operaciones"
  title="Plan de pagos"
  description="Gestioná las cuotas acordadas con el comprador: creá el plan, registrá cada pago y seguí el estado de deuda."
  sectionNumber={6}
>
  <UseCaseList items={[
    'Ver todas las cuotas de una reserva y su estado',
    'Registrar el cobro de una cuota con fecha y monto real',
    'Editar el monto o fecha de vencimiento de una cuota',
    'Eliminar un registro de pago incorrecto',
    'Ver el total cobrado vs el total pendiente',
  ]} />
  <WorkflowList
    category="Operaciones"
    steps={[
      { label: 'Abrí el detalle de la reserva', description: 'Desde /reservas, clic en la reserva. En la página de detalle, seleccioná la tab "Plan de Pagos".' },
      { label: 'Revisá las cuotas', description: 'Verás la tabla de cuotas: número, vencimiento, monto, estado (pendiente / parcial / pagada / vencida).' },
      { label: 'Registrá un pago', description: 'Clic en el ícono de pago de una cuota → ingresá fecha de pago, monto cobrado y método. Confirmá.' },
      { label: 'Vinculá a una factura (opcional)', description: 'Si ya cargaste la factura de ingreso correspondiente, podés vincularla desde el modal de pago usando el selector "Pago vinculado".' },
      { label: 'Revisá el resumen', description: 'Al pie de la tabla verás el total del plan, lo cobrado hasta hoy y el saldo pendiente.' },
    ]}
  />
  <AnnotatedScreenshot
    src="/guia/reservas.png"
    alt="Plan de pagos de una reserva"
    annotations={[
      { x: 20, y: 15, label: 'Tab Plan de Pagos', description: 'Seleccioná esta tab para ver las cuotas' },
      { x: 75, y: 45, label: 'Botón registrar pago', description: 'Ícono en cada fila para registrar el cobro' },
      { x: 50, y: 80, label: 'Resumen del plan', description: 'Total, cobrado y pendiente en la parte inferior' },
    ]}
  />
  <TipCard>
    Las cuotas vencidas (fecha de vencimiento pasada y sin pago registrado) se destacan en rojo. El sistema actualiza estos estados automáticamente cada noche.
  </TipCard>
  <TipCard>
    Podés editar el monto de una cuota haciendo clic en el número. Útil para ajustes por tipo de cambio o renegociaciones.
  </TipCard>
</GuiaSection>
```

**Step 3: Add `CreditCard` to lucide-react imports**

**Step 4: Build + commit**

```bash
cd /Users/mcendoya/repos/real-estate/frontend && npm run build 2>&1 | tail -20
git add frontend/src/app/guia/page.tsx
git commit -m "feat: guia chapter Plan de pagos"
```

---

## Task 7 — Chapter: Portal del comprador

**Files:**
- Modify: `frontend/src/app/guia/page.tsx`
- Needs screenshot: `public/guia/portal-login.png`, `public/guia/portal-dashboard.png` (take manually if Playwright script can't reach portal routes without comprador credentials)

**Step 1: Add to SECTIONS array**

```tsx
{ id: 'portal-comprador', label: 'Portal del comprador', icon: KeyRound },
```

**Step 2: Add section after Plan de pagos**

```tsx
{/* Portal del comprador */}
<GuiaSection
  id="portal-comprador"
  icon={KeyRound}
  category="Compradores"
  title="Portal del comprador"
  description="Generá acceso al portal para que cada comprador vea el avance de obra de su proyecto y su propio plan de pagos, sin acceder al panel interno."
  sectionNumber={7}
>
  <UseCaseList items={[
    'Crear o regenerar el acceso de un comprador al portal',
    'Ver qué información tiene disponible el comprador en su portal',
    'Enviarle las credenciales al comprador',
    'Revocar el acceso si la reserva fue cancelada',
  ]} />

  <div>
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
      Cómo generar el acceso
    </p>
  </div>

  <WorkflowList
    category="Compradores"
    steps={[
      { label: 'Ir a la reserva convertida', description: 'Desde /reservas, filtrá por "Convertidas". Solo las reservas convertidas pueden tener portal activo.' },
      { label: 'Clic en el ícono de llave', description: 'Cada fila con reserva convertida muestra un ícono de llave (🔑) a la derecha. Hacé clic.' },
      { label: 'Copiá las credenciales', description: 'Se abre un modal con el email y la contraseña temporal del comprador. Copiá ambos con el botón "Copiar".' },
      { label: 'Enviáselas al comprador', description: 'Compartí el link del portal y las credenciales por WhatsApp, email u otro canal.' },
      { label: 'El comprador ingresa', description: 'Al entrar por primera vez, el portal pide que cambie la contraseña temporal.' },
    ]}
  />

  <div className="space-y-3">
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      Qué ve el comprador
    </p>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {[
        { title: 'Avance de obra', desc: 'Etapas de construcción con porcentaje de progreso y fotos. Solo información pública, sin notas internas.' },
        { title: 'Mi plan de pagos', desc: 'Sus cuotas con estado, montos y fechas de vencimiento. Los pagos registrados aparecen confirmados.' },
      ].map(({ title, desc }) => (
        <div key={title} className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-100">
          <p className="text-sm font-semibold text-indigo-900 mb-1">{title}</p>
          <p className="text-sm text-indigo-700/80">{desc}</p>
        </div>
      ))}
    </div>
  </div>

  <TipCard>
    Si regenerás el acceso de un comprador que ya tenía credenciales, se crea una nueva contraseña temporal y la anterior queda inválida. Útil si el comprador olvidó su contraseña.
  </TipCard>
  <RoleNote>
    Solo los roles admin y gerente pueden generar accesos al portal. El ícono de llave solo aparece en reservas con email del comprador cargado y estado "Convertida".
  </RoleNote>
</GuiaSection>
```

**Step 3: Add `KeyRound` to lucide-react imports**

**Step 4: Build + commit**

```bash
cd /Users/mcendoya/repos/real-estate/frontend && npm run build 2>&1 | tail -20
git add frontend/src/app/guia/page.tsx
git commit -m "feat: guia chapter Portal del comprador"
```

---

## Task 8 — Chapter: Inbox & Agente IA (upgrade existing)

Update the existing Inbox section (currently section 9) to include HITL/handoff content.

**Files:**
- Modify: `frontend/src/app/guia/page.tsx`

**Step 1: Replace the existing Inbox section content**

Find the `{/* 9 — Inbox */}` block and add HITL content after the existing workflow steps:

```tsx
{/* Add after existing TipCards in Inbox section */}

<div>
  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
    Intervención humana (HITL)
  </p>
</div>

<WorkflowList
  category="Comunicaciones"
  steps={[
    { label: 'El agente activa la intervención', description: 'Cuando el lead necesita atención personalizada, el agente de IA activa el modo HITL automáticamente. Recibís una notificación por WhatsApp con el link a la conversación.' },
    { label: 'Hacé clic en el link', description: 'El link te lleva directamente a la conversación en el Inbox. Si no estabas logueado, te pide las credenciales y luego te redirige automáticamente.' },
    { label: 'Respondé directamente', description: 'En modo HITL, los mensajes que escribís en el Inbox se envían directamente al lead por WhatsApp. La IA no responde mientras el handoff esté activo.' },
    { label: 'Cerrá el handoff', description: 'Cuando terminaste de atender al lead, hacé clic en "Cerrar handoff". La IA retoma el control de la conversación automáticamente.' },
  ]}
/>

<TipCard>
  La notificación de WhatsApp llega al número configurado en el canal de tu organización. Si no recibís las notificaciones, contactá al admin para verificar el número en la sección Usuarios → Canal WhatsApp.
</TipCard>

<AnnotatedScreenshot
  src="/guia/inbox.png"
  alt="Inbox con conversación activa"
  annotations={[
    { x: 25, y: 50, label: 'Lista de conversaciones', description: 'Leads con mensajes sin leer aparecen resaltados' },
    { x: 70, y: 75, label: 'Campo de respuesta', description: 'La IA sugiere una respuesta; podés editarla' },
    { x: 85, y: 20, label: 'Panel del lead', description: 'Info del prospecto y botones de gestión' },
  ]}
/>
```

**Step 2: Build + commit**

```bash
cd /Users/mcendoya/repos/real-estate/frontend && npm run build 2>&1 | tail -20
git add frontend/src/app/guia/page.tsx
git commit -m "feat: guia inbox chapter upgraded with HITL/handoff workflow"
```

---

## Task 9 — Chapter: Configuración

**Files:**
- Modify: `frontend/src/app/guia/page.tsx`

**Step 1: Add to SECTIONS array (after usuarios)**

```tsx
{ id: 'configuracion', label: 'Configuración', icon: Settings },
```

**Step 2: Add section (admin-only like Usuarios)**

```tsx
{/* Configuración (admin only) */}
{isAdmin && (
  <GuiaSection
    id="configuracion"
    icon={Settings}
    category="Administración"
    title="Configuración"
    description="Configurá el canal de WhatsApp de tu organización, el número de notificaciones al asesor y las integraciones activas."
    sectionNumber={12}
  >
    <UseCaseList items={[
      'Verificar qué canal de WhatsApp está activo',
      'Configurar el número de teléfono del asesor para notificaciones HITL',
      'Ver el proveedor de mensajería activo (Kapso, Twilio, etc.)',
    ]} />
    <WorkflowList
      category="Administración"
      steps={[
        { label: 'Accedé a Usuarios', description: 'Clic en "Usuarios" en el menú lateral. La configuración del canal está dentro de esta sección.' },
        { label: 'Seleccioná el canal activo', description: 'En la card del canal de WhatsApp, hacé clic en "Editar". Verás los datos del canal: proveedor, número, Phone Number ID.' },
        { label: 'Configurá el número de notificaciones', description: 'En el campo "Teléfono notificaciones", ingresá el número de WhatsApp del asesor que recibirá las alertas de HITL. Formato: código de país + número (ej: 5491112345678).' },
        { label: 'Guardá los cambios', description: 'Hacé clic en "Guardar". Los cambios aplican de inmediato — el próximo HITL notificará al nuevo número.' },
      ]}
    />
    <AnnotatedScreenshot
      src="/guia/usuarios.png"
      alt="Panel de usuarios y configuración de canal"
      annotations={[
        { x: 70, y: 40, label: 'Card del canal', description: 'Muestra el proveedor y estado del canal' },
        { x: 80, y: 60, label: 'Botón editar canal', description: 'Abre el modal de configuración' },
      ]}
    />
    <TipCard>
      El número de notificaciones debe pertenecer a una cuenta de WhatsApp que ya haya interactuado con el número del bot (el canal debe conocer al asesor). Si el asesor nunca habló con el número del bot, no recibirá mensajes hasta que lo haga al menos una vez.
    </TipCard>
    <RoleNote>
      Solo los admins pueden modificar la configuración del canal. Los cambios afectan a toda la organización.
    </RoleNote>
  </GuiaSection>
)}
```

**Step 3: Add `Settings` to lucide-react imports**

**Step 4: Build + commit**

```bash
cd /Users/mcendoya/repos/real-estate/frontend && npm run build 2>&1 | tail -20
git add frontend/src/app/guia/page.tsx
git commit -m "feat: guia chapter Configuracion (admin-only) with WhatsApp HITL setup"
```

---

## Task 10 — Add screenshots to existing chapters

Add `<AnnotatedScreenshot>` to the chapters that most benefit from visual context: Proyectos, Leads, Unidades, Reservas, Inbox.

**Files:**
- Modify: `frontend/src/app/guia/page.tsx`

**Step 1: Proyectos section — add screenshot after WorkflowList**

```tsx
<AnnotatedScreenshot
  src="/guia/proyectos.png"
  alt="Lista de proyectos"
  annotations={[
    { x: 30, y: 30, label: 'Card de proyecto', description: 'Cada card muestra KPIs: unidades, ventas, leads' },
    { x: 85, y: 15, label: 'Nuevo proyecto', description: 'Botón para crear un proyecto con CSV de unidades' },
  ]}
/>
```

**Step 2: Leads section — add screenshot after WorkflowList**

```tsx
<AnnotatedScreenshot
  src="/guia/leads.png"
  alt="Kanban de leads"
  annotations={[
    { x: 15, y: 20, label: 'Columna Hot', description: 'Leads con alta probabilidad de cierre' },
    { x: 50, y: 20, label: 'Columna Warm', description: 'Leads en seguimiento activo' },
    { x: 82, y: 20, label: 'Columna Cold', description: 'Leads con baja actividad reciente' },
    { x: 50, y: 55, label: 'Card de lead', description: 'Hacé clic para ver el detalle y gestionar la reserva' },
  ]}
/>
```

**Step 3: Unidades section — add screenshot after WorkflowList**

```tsx
<AnnotatedScreenshot
  src="/guia/unidades.png"
  alt="Grilla de unidades por piso"
  annotations={[
    { x: 20, y: 40, label: 'Verde = disponible', description: 'Clic para reservar o hacer venta directa' },
    { x: 50, y: 40, label: 'Amarillo = reservada', description: 'Tiene reserva activa' },
    { x: 75, y: 40, label: 'Rojo = vendida', description: 'Operación cerrada o convertida' },
  ]}
/>
```

**Step 4: Build + commit**

```bash
cd /Users/mcendoya/repos/real-estate/frontend && npm run build 2>&1 | tail -20
git add frontend/src/app/guia/page.tsx
git commit -m "feat: guia add annotated screenshots to Proyectos, Leads, Unidades chapters"
```

---

## Task 11 — Update SECTIONS numbering + glossary

Renumber all `sectionNumber` props to reflect the final chapter order. Update the glosario with new terms.

**Final chapter order:**
1. Primeros pasos
2. Proyectos
3. Dashboard
4. Leads
5. Unidades
6. Reservas
7. Plan de pagos
8. Portal del comprador
9. Obra
10. Financiero
11. Inversores
12. Inbox & Agente IA
13. Tools
14. Usuarios
15. Configuración

**Step 1: Update all `sectionNumber` props in order**

Do a pass through all `<GuiaSection>` usages and set the correct `sectionNumber`.

**Step 2: Add new glossary terms**

```tsx
{ term: 'HITL',              def: 'Human In The Loop. Modo donde un asesor humano toma el control de la conversación de WhatsApp en lugar del agente de IA.' },
{ term: 'Handoff',           def: 'El traspaso de la conversación del agente de IA a un asesor humano.' },
{ term: 'Portal del comprador', def: 'Acceso externo para compradores donde pueden ver el avance de obra y su plan de pagos sin entrar al panel interno.' },
{ term: 'Comprador',         def: 'Usuario con rol de solo lectura que accede al portal del comprador con sus propias credenciales.' },
```

**Step 3: Build + commit**

```bash
cd /Users/mcendoya/repos/real-estate/frontend && npm run build 2>&1 | tail -20
git add frontend/src/app/guia/page.tsx
git commit -m "feat: guia final numbering + extended glossary"
```

---

## Task 12 — Deploy

**Step 1: Run full build**

```bash
cd /Users/mcendoya/repos/real-estate/frontend && npm run build
```

**Step 2: Use /deploy skill**

Follow the deploy skill checklist to push to main and verify production at `/guia`.

---

## Verification

1. Open `/guia` — sidebar shows all 15 chapters, scroll works
2. Mobile: hamburger button opens Sheet drawer with chapter nav
3. Click chapter in nav → scrolls to section
4. Screenshots load (no broken images)
5. Hover over numbered callout → tooltip appears
6. Click "Descargar PDF" → browser print dialog opens, all chapters visible
7. Admin role: sees Usuarios + Configuración chapters
8. Non-admin: Usuarios + Configuración hidden
9. `/guia` is accessible without login (public route)
