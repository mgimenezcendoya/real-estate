# REALIA — Figma Design System Rules

Rules for implementing Figma designs and maintaining UI consistency in the REALIA real estate admin dashboard.

## Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript 5
- **Styling:** Tailwind CSS 4 — no `tailwind.config.ts`, all tokens in `@theme {}` inside `globals.css`
- **Components:** shadcn/ui v3 (New York style) located in `frontend/src/components/ui/`
- **Icons:** Lucide React only — do NOT install other icon libraries
- **Utilities:** `cn()` from `@/lib/utils` — always use this for class composition

---

## Figma MCP — Required Workflow

When implementing any Figma design:

1. Run `get_design_context` on the target node
2. If response is too large, run `get_metadata` first to get the node map, then fetch only the needed nodes
3. Run `get_screenshot` for visual reference of the exact variant
4. Download any image/SVG assets — if Figma MCP returns a localhost source, use it directly
5. Translate React + Tailwind output to REALIA conventions (see below)
6. Validate final UI against the Figma screenshot before marking complete

**IMPORTANT:** Strive for 1:1 visual parity with the Figma design.

---

## Component Location

| Type | Path |
|------|------|
| shadcn primitives | `frontend/src/components/ui/` |
| Shared feature components | `frontend/src/components/` |
| Page-level components | Colocated in `frontend/src/app/[route]/` |
| Hooks | `frontend/src/hooks/` |
| API client + utils | `frontend/src/lib/` |

**ALWAYS reuse components from `frontend/src/components/ui/` before creating new ones.**

---

## Styling Rules

- **IMPORTANT:** Never hardcode hex colors — always use CSS variables (`var(--primary)`, `var(--border)`, etc.) or Tailwind semantic classes (`text-primary`, `bg-background`, etc.)
- **IMPORTANT:** Never install new CSS frameworks or icon libraries
- Use `cn()` from `@/lib/utils` for all class merging — never use `clsx` or `classnames` directly
- Spacing: Tailwind 4px scale (`gap-4` = 16px, `p-6` = 24px, etc.)
- Border radius: use semantic scale — `rounded-xl` (cards), `rounded-lg` (inputs), `rounded-full` (badges/avatars)
- All interactive elements need `transition-colors` or `transition-all` for smooth state changes

### Color Tokens (CSS variables in `:root`)

```
--primary          → brand color (buttons, active states, links)
--primary-foreground → text on primary bg
--background       → page/surface background
--foreground       → primary text
--muted            → subtle backgrounds
--muted-foreground → secondary/placeholder text
--accent           → tinted hover/focus backgrounds
--accent-foreground → text on accent bg
--border           → all borders and dividers
--input            → input field borders
--ring             → focus rings
--destructive      → errors, delete actions

/* Status colors (app-level vars) */
--green            → available, success states
--amber            → reserved, warning states
--red              → sold, error states
```

### Typography

- `font-display` (Outfit) → headings `h1`–`h4`, titles, display text
- `font-sans` (DM Sans) → all body text, labels, descriptions
- All-caps labels: `text-xs font-semibold uppercase tracking-wider text-muted-foreground`
- Tabular numbers for data: add class `tabular` (from globals.css)

---

## Component Patterns

### CVA for variants
Components use Class Variance Authority. When creating new variants:
```tsx
import { cva } from "class-variance-authority"
const variants = cva("base-classes", { variants: { ... } })
```

### data-slot attributes
All shadcn components use `data-slot="component-name"` — maintain this pattern.

### Compound components
Card, Sheet, Select, Avatar — use the subcomponent pattern:
```tsx
<Card>
  <CardHeader><CardTitle>...</CardTitle></CardHeader>
  <CardContent>...</CardContent>
</Card>
```

### Toasts
```tsx
import { toast } from "sonner"
toast.success("Mensaje")
toast.error("Error")
```

### Loading states
Use `<Skeleton>` from `@/components/ui/skeleton` — always provide skeletons for async data.

### Side panels
Use `<Sheet>` from `@/components/ui/sheet` for detail drawers (right side, max-w-sm).

---

## Custom Utility Classes (globals.css)

```
.glass            → white card with border + subtle shadow
.glass-elevated   → card with stronger shadow
.glass-pill       → chip/tag pill background
.card-top-accent  → animated indigo→violet stripe on hover
.hover-lift       → translateY(-2px) + shadow on hover
.hover-glow       → glow effect on hover
.gradient-text    → dark→primary gradient text
.animate-fade-in-up → staggered entrance animation
.anim-delay-{0-5} → animation delay variants (0–250ms)
```

---

## Asset Handling

- **IMPORTANT:** If Figma MCP returns a localhost URL for an image or SVG, use it directly — do NOT create placeholders
- Static assets → `frontend/public/`
- Supabase Storage assets → accessed via `S3_PUBLIC_URL` env var (already configured)
- Login background image is hosted at Supabase: `assets/login-bg.png`

---

## Architecture Patterns

### Data fetching
- `useAsync` hook from `frontend/src/hooks/useAsync.ts` — use for all async state with AbortController
- API client: all endpoints in `frontend/src/lib/api.ts` — always add new endpoints there

### Auth
- `useAuth()` from `@/contexts/AuthContext` — provides `login`, `logout`, `user`, `isAuthenticated`
- Protected routes via `AuthLayout` component — wrap all admin pages

### Optimistic updates
Used in UnidadesPage — show change immediately, revert on error. Apply this pattern for unit status changes.

### State
- Local component state with `useState` — prefer over global when possible
- No Redux/Zustand — keep state local or lifted to nearest common ancestor

---

## Route Structure

```
/                           → Login (public)
/proyectos                  → Projects list
/proyectos/[id]             → Project dashboard
/proyectos/[id]/leads       → Kanban (Hot/Warm/Cold)
/proyectos/[id]/unidades    → Unit grid by floor
/proyectos/[id]/reservas    → Reservations list
/proyectos/[id]/documentos  → Documents
/proyectos/[id]/obra        → Construction + Pagos tab
/proyectos/[id]/financiero  → Financial dashboard
/proyectos/[id]/inversores  → Investors portal
/inbox                      → Conversations inbox
```

---

## Do NOT

- Do NOT use `clsx` or `classnames` directly — always use `cn()`
- Do NOT hardcode color hex values in components
- Do NOT install Radix UI packages individually — use the bundled `radix-ui` package
- Do NOT install new icon libraries — use `lucide-react` only
- Do NOT create duplicate components if one exists in `frontend/src/components/ui/`
- Do NOT add dark mode — this project is light-theme only
- Do NOT use `any` TypeScript type unless absolutely necessary
- Do NOT use inline styles — always use Tailwind classes or CSS variables
