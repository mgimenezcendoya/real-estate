'use client';

import {
  BookOpen,
  Building2,
  LayoutDashboard,
  Flame,
  Home,
  ClipboardList,
  HardHat,
  DollarSign,
  TrendingUp,
  MessageSquare,
  Wrench,
  Users,
  Lightbulb,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import GuiaStickyNav from './GuiaStickyNav';

// ─── Section definitions ────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'proyectos', label: 'Proyectos', icon: Building2 },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'leads', label: 'Leads', icon: Flame },
  { id: 'unidades', label: 'Unidades', icon: Home },
  { id: 'reservas', label: 'Reservas', icon: ClipboardList },
  { id: 'obra', label: 'Obra', icon: HardHat },
  { id: 'financiero', label: 'Financiero', icon: DollarSign },
  { id: 'inversores', label: 'Inversores', icon: TrendingUp },
  { id: 'inbox', label: 'Inbox', icon: MessageSquare },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'usuarios', label: 'Usuarios', icon: Users },
];

// ─── Category color config ──────────────────────────────────────────────────────

interface CategoryConfig {
  iconGradient: string;
  badgeBg: string;
  badgeText: string;
  stepDot: string;
  stepLine: string;
}

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  'Módulo principal':  { iconGradient: 'from-blue-500 to-blue-700',     badgeBg: 'bg-blue-50',    badgeText: 'text-blue-700',    stepDot: 'bg-blue-600',    stepLine: 'bg-blue-100'    },
  'Analytics':         { iconGradient: 'from-violet-500 to-purple-700', badgeBg: 'bg-violet-50',  badgeText: 'text-violet-700',  stepDot: 'bg-violet-600',  stepLine: 'bg-violet-100'  },
  'CRM':               { iconGradient: 'from-orange-400 to-red-500',    badgeBg: 'bg-orange-50',  badgeText: 'text-orange-700',  stepDot: 'bg-orange-500',  stepLine: 'bg-orange-100'  },
  'Inventario':        { iconGradient: 'from-teal-500 to-emerald-600',  badgeBg: 'bg-teal-50',    badgeText: 'text-teal-700',    stepDot: 'bg-teal-600',    stepLine: 'bg-teal-100'    },
  'Operaciones':       { iconGradient: 'from-indigo-500 to-blue-600',   badgeBg: 'bg-indigo-50',  badgeText: 'text-indigo-700',  stepDot: 'bg-indigo-600',  stepLine: 'bg-indigo-100'  },
  'Construcción':      { iconGradient: 'from-amber-500 to-orange-600',  badgeBg: 'bg-amber-50',   badgeText: 'text-amber-700',   stepDot: 'bg-amber-500',   stepLine: 'bg-amber-100'   },
  'Finanzas':          { iconGradient: 'from-emerald-500 to-green-600', badgeBg: 'bg-emerald-50', badgeText: 'text-emerald-700', stepDot: 'bg-emerald-600', stepLine: 'bg-emerald-100' },
  'Portal Inversores': { iconGradient: 'from-purple-500 to-violet-700', badgeBg: 'bg-purple-50',  badgeText: 'text-purple-700',  stepDot: 'bg-purple-600',  stepLine: 'bg-purple-100'  },
  'Comunicaciones':    { iconGradient: 'from-sky-500 to-blue-600',      badgeBg: 'bg-sky-50',     badgeText: 'text-sky-700',     stepDot: 'bg-sky-600',     stepLine: 'bg-sky-100'     },
  'Utilidades':        { iconGradient: 'from-slate-500 to-gray-700',    badgeBg: 'bg-slate-50',   badgeText: 'text-slate-700',   stepDot: 'bg-slate-600',   stepLine: 'bg-slate-200'   },
  'Administración':    { iconGradient: 'from-rose-500 to-red-600',      badgeBg: 'bg-rose-50',    badgeText: 'text-rose-700',    stepDot: 'bg-rose-600',    stepLine: 'bg-rose-100'    },
};

const DEFAULT_CONFIG: CategoryConfig = {
  iconGradient: 'from-blue-500 to-violet-600',
  badgeBg: 'bg-blue-50',
  badgeText: 'text-blue-700',
  stepDot: 'bg-blue-600',
  stepLine: 'bg-blue-100',
};

function getCategoryConfig(category: string): CategoryConfig {
  return CATEGORY_CONFIG[category] ?? DEFAULT_CONFIG;
}

// ─── Inner components ───────────────────────────────────────────────────────────

function GuiaSection({
  id,
  icon: Icon,
  category,
  title,
  description,
  sectionNumber,
  children,
}: {
  id: string;
  icon: LucideIcon;
  category: string;
  title: string;
  description: string;
  sectionNumber: number;
  children?: React.ReactNode;
}) {
  const cfg = getCategoryConfig(category);

  return (
    <section id={id} className="scroll-mt-6">
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm">
        {/* Category-colored top accent — isolated overflow to preserve border-radius */}
        <div className="rounded-t-2xl overflow-hidden">
          <div className={cn('h-[3px] w-full bg-gradient-to-r', cfg.iconGradient)} />
        </div>
        {/* Card header */}
        <div className="relative px-6 pt-5 pb-4 border-b border-gray-100">
          {/* Faded section number watermark */}
          <span
            aria-hidden
            className="absolute right-5 top-1/2 -translate-y-1/2 text-[72px] font-black text-gray-900 select-none pointer-events-none"
            style={{ opacity: 0.03, lineHeight: 1 }}
          >
            {String(sectionNumber).padStart(2, '0')}
          </span>

          <div className="flex items-start gap-4 relative">
            {/* Category-colored icon */}
            <div
              className={cn(
                'w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm bg-gradient-to-br',
                cfg.iconGradient
              )}
            >
              <Icon size={20} className="text-white" />
            </div>

            <div className="flex-1 min-w-0">
              {/* Category badge */}
              <span
                className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider mb-1',
                  cfg.badgeBg,
                  cfg.badgeText
                )}
              >
                {category}
              </span>
              <h2 className="font-display font-bold text-xl text-foreground leading-tight">{title}</h2>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>
            </div>
          </div>
        </div>

        {/* Card body */}
        {children && (
          <div className="px-6 py-5 space-y-5">
            {children}
          </div>
        )}
      </div>
    </section>
  );
}

function WorkflowStep({
  step,
  label,
  description,
  isLast,
  dotClass,
  lineClass,
}: {
  step: number;
  label: string;
  description: string;
  isLast: boolean;
  dotClass: string;
  lineClass: string;
}) {
  return (
    <div className="flex gap-4">
      {/* Timeline column */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div
          className={cn(
            'w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center z-10 flex-shrink-0',
            dotClass
          )}
        >
          {step}
        </div>
        {!isLast && <div className={cn('w-px flex-1 mt-1', lineClass)} style={{ minHeight: '16px' }} />}
      </div>

      {/* Content */}
      <div className={cn('min-w-0', !isLast && 'pb-4')}>
        <p className="text-sm font-semibold text-foreground leading-snug">{label}</p>
        <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function WorkflowList({
  steps,
  category,
}: {
  steps: { label: string; description: string }[];
  category: string;
}) {
  const cfg = getCategoryConfig(category);
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">
        Paso a paso
      </p>
      <div>
        {steps.map((s, i) => (
          <WorkflowStep
            key={i}
            step={i + 1}
            label={s.label}
            description={s.description}
            isLast={i === steps.length - 1}
            dotClass={cfg.stepDot}
            lineClass={cfg.stepLine}
          />
        ))}
      </div>
    </div>
  );
}

function TipCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 bg-indigo-50/50 rounded-xl px-4 py-3.5 border border-indigo-100">
      <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Lightbulb size={12} className="text-indigo-600" />
      </div>
      <p className="text-sm text-indigo-900/80 leading-relaxed">{children}</p>
    </div>
  );
}

function RoleNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 bg-amber-50/70 rounded-xl px-4 py-3.5 border border-amber-200/60">
      <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <ShieldAlert size={12} className="text-amber-600" />
      </div>
      <p className="text-xs text-amber-800 leading-relaxed">{children}</p>
    </div>
  );
}

function UseCaseList({ items }: { items: string[] }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
        Casos de uso típicos
      </p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 mt-2 flex-shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function GuiaPage() {
  const { isAdmin } = useAuth();

  const visibleSections = isAdmin
    ? SECTIONS
    : SECTIONS.filter((s) => s.id !== 'usuarios');

  return (
    <div className="flex-1 min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-6 md:px-8 py-6 md:py-8">

        {/* Header */}
        <div className="mb-8">
          <div className="relative bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-600 rounded-2xl px-6 py-6 overflow-hidden shadow-md">
            {/* Decorative circles */}
            <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/5" />
            <div className="absolute -bottom-8 right-16 w-20 h-20 rounded-full bg-white/5" />
            <div className="absolute top-4 right-32 w-8 h-8 rounded-full bg-white/10" />

            <div className="relative flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center flex-shrink-0 shadow-sm">
                <BookOpen size={22} className="text-white" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/15 border border-white/20 text-white/80 text-[10px] font-semibold uppercase tracking-wider mb-1">
                  Manual de usuario
                </div>
                <h1 className="text-2xl font-display font-bold text-white leading-tight">Guía de Uso</h1>
                <p className="text-sm text-indigo-100 mt-0.5">Todo lo que necesitás saber para operar REALIA</p>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile: horizontal chip nav */}
        <div className="lg:hidden mb-6 -mx-1 overflow-x-auto pb-1">
          <div className="flex gap-2 px-1 w-max">
            {visibleSections.map(({ id, label, icon: Icon }) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-colors whitespace-nowrap"
              >
                <Icon size={12} />
                {label}
              </a>
            ))}
          </div>
        </div>

        {/* Two-column layout */}
        <div className="flex gap-8">

          {/* Left sticky nav — desktop only */}
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <div className="sticky top-6">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 mb-2">
                Contenidos
              </p>
              <GuiaStickyNav sections={visibleSections} />
            </div>
          </aside>

          {/* Scrollable content */}
          <div className="flex-1 space-y-5 min-w-0">

            {/* 1 — Proyectos */}
            <GuiaSection
              id="proyectos"
              icon={Building2}
              category="Módulo principal"
              title="Proyectos"
              description="El punto de entrada de REALIA. Cada proyecto representa un desarrollo inmobiliario con sus unidades, leads, obra y finanzas."
              sectionNumber={1}
            >
              <UseCaseList items={[
                'Ver todos los proyectos activos de la organización',
                'Crear un nuevo proyecto subiendo el CSV de unidades',
                'Acceder rápidamente al dashboard de un proyecto',
                'Identificar el estado general de ventas de cada desarrollo',
              ]} />
              <WorkflowList
                category="Módulo principal"
                steps={[
                  { label: 'Accedé a /proyectos', description: 'Verás las cards de todos los proyectos con sus KPIs principales.' },
                  { label: 'Creá un nuevo proyecto', description: 'Hacé clic en "Nuevo Proyecto", completá el nombre y subí el CSV de unidades. El sistema parsea pisos, tipos y precios automáticamente.' },
                  { label: 'Seleccioná un proyecto', description: 'Clic en la card para entrar al dashboard del proyecto.' },
                  { label: 'Navegá entre módulos', description: 'Usá las tabs internas (Leads, Unidades, Reservas, Obra, Financiero, Inversores) para acceder a cada sección.' },
                ]}
              />
              <TipCard>
                El CSV de unidades debe tener columnas: piso, unidad, tipo, superficie, precio. Podés actualizar las unidades re-subiendo el CSV desde la configuración del proyecto.
              </TipCard>
            </GuiaSection>

            {/* 2 — Dashboard */}
            <GuiaSection
              id="dashboard"
              icon={LayoutDashboard}
              category="Analytics"
              title="Dashboard"
              description="Vista ejecutiva del proyecto con métricas de ventas, absorción y performance de leads en tiempo real."
              sectionNumber={2}
            >
              <UseCaseList items={[
                'Ver el estado de ventas consolidado (vendidas, reservadas, disponibles)',
                'Monitorear la tasa de absorción mensual',
                'Seguir el embudo de leads por etapa',
                'Comparar ingresos proyectados vs realizados',
              ]} />
              <WorkflowList
                category="Analytics"
                steps={[
                  { label: 'Entrá al proyecto', description: 'Desde /proyectos, clic en el proyecto deseado. Aterrizás en el dashboard.' },
                  { label: 'Revisá los KPIs superiores', description: 'Las cards muestran unidades vendidas, en reserva, disponibles, y monto total comercializado.' },
                  { label: 'Analizá los gráficos', description: 'El gráfico de barras muestra la absorción mensual. El embudo muestra conversión de leads.' },
                  { label: 'Filtrá por período', description: 'Usá el selector de fechas para ver métricas de un rango específico.' },
                ]}
              />
              <TipCard>
                Los datos del dashboard se actualizan en tiempo real. Si acabás de registrar una venta, recargá la página para ver los números actualizados.
              </TipCard>
            </GuiaSection>

            {/* 3 — Leads */}
            <GuiaSection
              id="leads"
              icon={Flame}
              category="CRM"
              title="Leads"
              description="Kanban de prospectos organizado por temperatura de interés. Gestioná el pipeline de ventas desde el primer contacto hasta la reserva."
              sectionNumber={3}
            >
              <UseCaseList items={[
                'Registrar nuevos prospectos y su interés en unidades',
                'Mover leads entre etapas (Hot / Warm / Cold)',
                'Ver el historial de conversaciones de cada lead',
                'Convertir un lead caliente en reserva directamente',
              ]} />
              <WorkflowList
                category="CRM"
                steps={[
                  { label: 'Abrí el Kanban', description: 'Desde el proyecto, hacé clic en la tab "Leads". Verás tres columnas: Hot, Warm, Cold.' },
                  { label: 'Creá un lead', description: 'Clic en "+ Nuevo Lead", completá nombre, teléfono, email y la unidad de interés.' },
                  { label: 'Gestioná el pipeline', description: 'Arrastrá los leads entre columnas o usá el menú de opciones para cambiar la temperatura.' },
                  { label: 'Reservá desde el lead', description: 'Abrí el detalle del lead (clic en la card) y usá el botón "Reservar unidad" para iniciar el wizard de reserva.' },
                ]}
              />
              <TipCard>
                Los leads con actividad reciente en el Inbox aparecen con un indicador visual. Usá el filtro de búsqueda para encontrar un lead por nombre o teléfono rápidamente.
              </TipCard>
              <RoleNote>
                Los vendedores solo ven los leads asignados a ellos. Los gerentes y admins ven todos los leads del proyecto.
              </RoleNote>
            </GuiaSection>

            {/* 4 — Unidades */}
            <GuiaSection
              id="unidades"
              icon={Home}
              category="Inventario"
              title="Unidades"
              description="Grilla visual de todas las unidades por piso. Estado en tiempo real: disponible, reservada o vendida."
              sectionNumber={4}
            >
              <UseCaseList items={[
                'Ver el plano de disponibilidad por piso',
                'Reservar una unidad directamente desde la grilla',
                'Registrar una venta directa (sin reserva previa)',
                'Liberar una unidad reservada que no avanzó',
              ]} />
              <WorkflowList
                category="Inventario"
                steps={[
                  { label: 'Accedé a Unidades', description: 'Tab "Unidades" dentro del proyecto. Las unidades se muestran agrupadas por piso.' },
                  { label: 'Identificá el estado', description: 'Verde = disponible, amarillo = reservada, rojo = vendida. Clic en cualquier unidad para ver su detalle.' },
                  { label: 'Reservá una unidad', description: 'Clic en una unidad disponible → "Reservar". Se abre el wizard de reserva con datos del comprador y plan de pagos.' },
                  { label: 'Registrá venta directa', description: 'Clic en una unidad disponible → "Venta directa". Útil para operaciones que ya están cerradas.' },
                ]}
              />
              <TipCard>
                Podés filtrar por tipo de unidad (1 amb, 2 amb, etc.) usando los chips en la parte superior. El mapa de calor muestra qué pisos tienen más disponibilidad.
              </TipCard>
            </GuiaSection>

            {/* 5 — Reservas */}
            <GuiaSection
              id="reservas"
              icon={ClipboardList}
              category="Operaciones"
              title="Reservas"
              description="Centro de operaciones comerciales. Gestioná reservas activas, planes de pago, cuotas y facturas vinculadas."
              sectionNumber={5}
            >
              <UseCaseList items={[
                'Ver todas las operaciones del proyecto (activas, convertidas, canceladas)',
                'Editar el plan de pagos de una reserva',
                'Registrar el cobro de una cuota',
                'Convertir una reserva en venta o cancelarla',
                'Imprimir el comprobante de reserva',
              ]} />
              <WorkflowList
                category="Operaciones"
                steps={[
                  { label: 'Abrí Reservas', description: 'Tab "Reservas" del proyecto. Usá los chips de estado para filtrar: Activas, Convertidas, Canceladas.' },
                  { label: 'Entrá al detalle', description: 'Clic en una reserva → abre la página de detalle con tabs "Detalle" y "Plan de Pagos".' },
                  { label: 'Gestioná las cuotas', description: 'En "Plan de Pagos" podés ver todas las cuotas, registrar pagos (con fecha y monto real) y editar los montos.' },
                  { label: 'Convertí o cancelá', description: 'Desde el detalle, usá "Convertir a venta" cuando se escriture, o "Cancelar reserva" si la operación no avanza.' },
                  { label: 'Imprimí el comprobante', description: 'Botón "Imprimir" genera una página PDF limpia con todos los datos de la reserva.' },
                ]}
              />
              <TipCard>
                Al registrar un pago en el plan de cuotas, podés vincularlo a una factura de ingreso existente. Esto centraliza la trazabilidad financiera de la operación.
              </TipCard>
              <TipCard>
                Las cuotas vencidas aparecen destacadas en rojo. El sistema actualiza automáticamente los estados de pago cada noche.
              </TipCard>
            </GuiaSection>

            {/* 6 — Obra */}
            <GuiaSection
              id="obra"
              icon={HardHat}
              category="Construcción"
              title="Obra"
              description="Seguimiento del avance de construcción por etapas ponderadas y gestión de pagos a proveedores."
              sectionNumber={6}
            >
              <UseCaseList items={[
                'Registrar el progreso porcentual de cada etapa de obra',
                'Ver el avance global ponderado del proyecto',
                'Cargar pagos a proveedores y subcontratistas',
                'Asociar gastos de obra a etapas específicas',
              ]} />
              <WorkflowList
                category="Construcción"
                steps={[
                  { label: 'Accedé a Obra', description: 'Tab "Obra" del proyecto. Verás las etapas listadas con su peso relativo y progreso actual.' },
                  { label: 'Actualizá el avance', description: 'Hacé clic en el porcentaje de una etapa para editarlo. El avance global se recalcula automáticamente.' },
                  { label: 'Registrá pagos', description: 'Cambiá a la tab "Pagos" dentro de Obra. Clic en "+ Nuevo Pago" para registrar un pago a proveedor.' },
                  { label: 'Completá los datos del pago', description: 'Ingresá proveedor, monto, fecha, etapa de obra asociada y adjuntá la factura si corresponde.' },
                ]}
              />
              <TipCard>
                Las etapas de obra tienen pesos asignados (ej: "Estructura" pesa 30%, "Terminaciones" 15%). El avance global es el promedio ponderado de todas las etapas.
              </TipCard>
              <RoleNote>
                Solo los roles admin y gerente pueden modificar el progreso de etapas. Los vendedores tienen acceso de solo lectura a la sección de Obra.
              </RoleNote>
            </GuiaSection>

            {/* 7 — Financiero */}
            <GuiaSection
              id="financiero"
              icon={DollarSign}
              category="Finanzas"
              title="Financiero"
              description="Dashboard financiero integral: resumen de KPIs, gestión de facturas y flujo de caja proyectado vs real."
              sectionNumber={7}
            >
              <UseCaseList items={[
                'Ver el P&L del proyecto en tiempo real',
                'Cargar facturas de ingresos y egresos',
                'Vincular facturas de ingreso a cuotas cobradas',
                'Analizar el flujo de caja mes a mes',
                'Subir PDF de facturas al repositorio documental',
              ]} />
              <WorkflowList
                category="Finanzas"
                steps={[
                  { label: 'Abrí Financiero', description: 'Tab "Financiero" del proyecto. La vista por defecto es "Resumen" con los KPIs principales.' },
                  { label: 'Revisá el resumen', description: 'Verás: presupuesto total, costo proyectado, ingresos reales, margen estimado. Las barras muestran ejecución vs presupuesto.' },
                  { label: 'Cargá una factura', description: 'Tab "Facturas" → "+ Nueva Factura". Completá tipo (ingreso/egreso), monto, fecha, categoría y proveedor/cliente.' },
                  { label: 'Vinculá facturas de ingreso', description: 'Al crear una factura de ingreso, podés vincularla al pago de una cuota específica usando el selector de "Pago vinculado".' },
                  { label: 'Analizá el flujo de caja', description: 'Tab "Flujo de Caja" muestra el gráfico de barras mes a mes con ingresos, egresos y saldo neto.' },
                ]}
              />
              <TipCard>
                En el Resumen podés crear presupuestos por rubro. Cada presupuesto puede asociarse a una etapa de obra (ej: Estructura, Terminaciones) o a una etapa no constructiva (ej: Comercialización, Honorarios, Marketing). Para las etapas de obra, la ejecución se toma de los pagos registrados en el módulo Obra. Para las etapas no constructivas, la ejecución se toma de los gastos cargados en Facturas.
              </TipCard>
              <TipCard>
                El flujo de caja combina datos reales (pagos registrados, facturas) con proyecciones (cuotas pendientes). Las barras azules son ingresos, las rojas son egresos.
              </TipCard>
              <TipCard>
                Podés subir el PDF de una factura directamente en el modal. El archivo se almacena en el repositorio del proyecto y queda vinculado a la factura para auditoría.
              </TipCard>
              <RoleNote>
                El módulo Financiero es visible solo para roles admin, superadmin y gerente. Los vendedores y lectores no tienen acceso a esta sección.
              </RoleNote>
            </GuiaSection>

            {/* 8 — Inversores */}
            <GuiaSection
              id="inversores"
              icon={TrendingUp}
              category="Portal Inversores"
              title="Inversores"
              description="Portal de comunicación con inversores del proyecto. Generá reportes de estado y enviálos por WhatsApp con un clic."
              sectionNumber={8}
            >
              <UseCaseList items={[
                'Ver el listado de inversores del proyecto',
                'Generar un reporte de avance para un inversor',
                'Enviar el reporte por WhatsApp directamente desde REALIA',
                'Consultar el historial de reportes enviados',
              ]} />
              <WorkflowList
                category="Portal Inversores"
                steps={[
                  { label: 'Accedé a Inversores', description: 'Tab "Inversores" del proyecto. Verás las cards de cada inversor con su participación.' },
                  { label: 'Seleccioná un inversor', description: 'Clic en la card del inversor para ver su detalle y generar un reporte.' },
                  { label: 'Generá el reporte', description: 'Clic en "Generar Reporte". REALIA compila automáticamente el estado de obra, ventas y financiero.' },
                  { label: 'Previsualizá y enviá', description: 'Verás el HTML del reporte antes de enviar. Confirmá y el reporte se envía por WhatsApp al número del inversor.' },
                  { label: 'Consultá el historial', description: 'El historial de reportes enviados queda registrado con fecha y estado de envío.' },
                ]}
              />
              <TipCard>
                El reporte se genera con los datos más recientes del proyecto al momento del envío. Asegurate de tener el avance de obra y las ventas actualizadas antes de enviarlo.
              </TipCard>
              <RoleNote>
                Solo admins y gerentes pueden enviar reportes a inversores. La sección es de solo lectura para otros roles.
              </RoleNote>
            </GuiaSection>

            {/* 9 — Inbox */}
            <GuiaSection
              id="inbox"
              icon={MessageSquare}
              category="Comunicaciones"
              title="Inbox"
              description="Centro de mensajes unificado. Conversaciones entrantes de WhatsApp y Telegram con respuesta asistida por IA."
              sectionNumber={9}
            >
              <UseCaseList items={[
                'Ver y responder mensajes de leads en tiempo real',
                'Consultar el historial de conversaciones de un prospecto',
                'Dejar que la IA proponga respuestas automáticas',
                'Etiquetar conversaciones y asignarlas a vendedores',
              ]} />
              <WorkflowList
                category="Comunicaciones"
                steps={[
                  { label: 'Abrí el Inbox', description: 'Desde el menú lateral, clic en "Inbox". Verás la lista de conversaciones activas.' },
                  { label: 'Seleccioná una conversación', description: 'Clic en cualquier conversación para abrir el hilo de mensajes.' },
                  { label: 'Revisá la sugerencia de IA', description: 'El campo de respuesta muestra una sugerencia generada por Claude. Podés editarla antes de enviar.' },
                  { label: 'Enviá la respuesta', description: 'Presioná Enter o el botón de envío. El mensaje se entrega por el canal original (WhatsApp o Telegram).' },
                  { label: 'Gestioná el lead', description: 'Desde el panel derecho podés ver el perfil del lead, cambiar su temperatura y vincular la conversación a un proyecto.' },
                ]}
              />
              <TipCard>
                El Inbox actualiza automáticamente cada 1.5 segundos. Si la IA responde primero un mensaje entrante, verás la respuesta automática en el hilo con un indicador especial.
              </TipCard>
              <TipCard>
                Las conversaciones con mensajes sin leer aparecen resaltadas. El badge en el menú lateral muestra el total de no leídos.
              </TipCard>
            </GuiaSection>

            {/* 10 — Tools */}
            <GuiaSection
              id="tools"
              icon={Wrench}
              category="Utilidades"
              title="Tools"
              description="Herramientas financieras para el mercado inmobiliario argentino: tipos de cambio ARS/USD y simulador de conversión."
              sectionNumber={10}
            >
              <UseCaseList items={[
                'Consultar la cotización del dólar oficial, MEP y blue',
                'Simular conversiones entre ARS y USD',
                'Comparar resultados entre tipos de cambio',
                'Ver el histórico de cotizaciones recientes',
              ]} />
              <WorkflowList
                category="Utilidades"
                steps={[
                  { label: 'Accedé a Tools', description: 'Clic en "Tools" en el menú lateral. Las cotizaciones se cargan automáticamente.' },
                  { label: 'Consultá los tipos de cambio', description: 'Verás las cards de Oficial, MEP y Blue con precios de compra, venta y spread.' },
                  { label: 'Usá el simulador', description: 'En la sección "Simulador", seleccioná la dirección (comprar USD / vender USD), el tipo de cambio y el monto.' },
                  { label: 'Compará entre tipos', description: 'La tabla comparativa muestra el resultado de tu conversión con cada tipo de cambio simultáneamente.' },
                ]}
              />
              <TipCard>
                Las cotizaciones se actualizan automáticamente cada 5 minutos. Los datos provienen de Argentina Datos y tienen un lag de 1 día hábil — es normal que el dato de hoy no esté disponible hasta mañana.
              </TipCard>
            </GuiaSection>

            {/* 11 — Usuarios (admin only) */}
            {isAdmin && (
              <GuiaSection
                id="usuarios"
                icon={Users}
                category="Administración"
                title="Usuarios"
                description="Gestión de usuarios de la plataforma. Creá cuentas, asigná roles y controlá los permisos de acceso."
                sectionNumber={11}
              >
                <UseCaseList items={[
                  'Crear nuevos usuarios (vendedores, gerentes, lectores)',
                  'Asignar y cambiar roles a usuarios existentes',
                  'Desactivar cuentas de usuarios que ya no operan',
                  'Ver el listado completo de usuarios de la organización',
                ]} />
                <WorkflowList
                  category="Administración"
                  steps={[
                    { label: 'Accedé a Usuarios', description: 'Clic en "Usuarios" en la sección inferior del menú lateral (solo visible para admins).' },
                    { label: 'Creá un usuario', description: 'Clic en "+ Nuevo Usuario". Completá nombre, email, contraseña inicial y rol.' },
                    { label: 'Asigná el rol correcto', description: 'Seleccioná: superadmin, admin, gerente, vendedor o lector según las responsabilidades del usuario.' },
                    { label: 'El usuario inicia sesión', description: 'El nuevo usuario puede ingresar con las credenciales creadas y cambiar su contraseña desde el menú inferior.' },
                  ]}
                />
                <TipCard>
                  Los superadmins tienen acceso completo a todas las organizaciones. Los admins gestionan su propia organización. Los gerentes acceden a todos los proyectos pero no pueden crear usuarios ni modificar configuración.
                </TipCard>
                <RoleNote>
                  Esta sección es exclusiva para roles admin y superadmin. Si no ves el link "Usuarios" en el menú, tu rol no tiene permisos de administración.
                </RoleNote>

                {/* Roles table */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Tabla de roles y permisos
                  </p>
                  <div className="overflow-x-auto border border-gray-200">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="text-left pl-4 pr-4 py-2.5 font-semibold text-gray-700">Rol</th>
                          <th className="text-center px-4 py-2.5 font-semibold text-gray-700">Proyectos</th>
                          <th className="text-center px-4 py-2.5 font-semibold text-gray-700">Ventas</th>
                          <th className="text-center px-4 py-2.5 font-semibold text-gray-700">Financiero</th>
                          <th className="text-center px-4 py-2.5 font-semibold text-gray-700">Inversores</th>
                          <th className="text-center px-4 py-2.5 font-semibold text-gray-700">Usuarios</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { rol: 'Superadmin', proyectos: '✓ Todos', ventas: '✓', financiero: '✓', inversores: '✓', usuarios: '✓' },
                          { rol: 'Admin',       proyectos: '✓ Org',   ventas: '✓', financiero: '✓', inversores: '✓', usuarios: '✓' },
                          { rol: 'Gerente',     proyectos: '✓ Todos', ventas: '✓', financiero: '✓', inversores: '✓ Ver', usuarios: '—' },
                          { rol: 'Vendedor',    proyectos: '✓ Ver',   ventas: '✓ Propios', financiero: '—', inversores: '—', usuarios: '—' },
                          { rol: 'Lector',      proyectos: '✓ Ver',   ventas: '✓ Ver', financiero: '—', inversores: '—', usuarios: '—' },
                        ].map((row, i, arr) => (
                          <tr key={row.rol} className={cn('hover:bg-gray-50/60 transition-colors', i < arr.length - 1 && 'border-b border-gray-100')}>
                            <td className="pl-5 pr-4 py-2.5 font-semibold text-gray-800">{row.rol}</td>
                            <td className="px-4 py-2.5 text-center text-gray-500">{row.proyectos}</td>
                            <td className="px-4 py-2.5 text-center text-gray-500">{row.ventas}</td>
                            <td className="px-4 py-2.5 text-center text-gray-500">{row.financiero}</td>
                            <td className="px-4 py-2.5 text-center text-gray-500">{row.inversores}</td>
                            <td className="px-4 pr-5 py-2.5 text-center text-gray-500">{row.usuarios}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </GuiaSection>
            )}

            {/* Glosario */}
            <section className="bg-white border border-gray-100 rounded-2xl shadow-sm">
              <div className="rounded-t-2xl overflow-hidden">
                <div className="h-[3px] w-full bg-gradient-to-r from-slate-400 to-gray-500" />
              </div>
              <div className="px-6 pt-5 pb-4 border-b border-gray-100">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Referencia</p>
                <h2 className="font-display font-bold text-xl text-foreground mt-0.5">Términos clave</h2>
              </div>
              <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { term: 'Lead',              def: 'Prospecto interesado en una o más unidades del proyecto.' },
                  { term: 'Cuota',             def: 'Pago pactado en el plan de pagos de una reserva, con fecha y monto definidos.' },
                  { term: 'Factura vinculada', def: 'Factura de ingreso asociada al registro de pago de una cuota específica.' },
                  { term: 'Etapa de obra',     def: 'Fase del proceso constructivo con un peso porcentual en el avance total.' },
                  { term: 'Reserva',           def: 'Operación comercial que bloquea una unidad para un comprador con un plan de pagos.' },
                  { term: 'Plan de pagos',     def: 'Conjunto de cuotas acordadas para completar el pago de una unidad reservada.' },
                ].map(({ term, def }) => (
                  <div key={term} className="bg-slate-50/70 rounded-xl p-3.5 border border-gray-100">
                    <p className="text-sm font-semibold text-gray-900">{term}</p>
                    <p className="text-sm text-gray-500 mt-0.5 leading-relaxed">{def}</p>
                  </div>
                ))}
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
