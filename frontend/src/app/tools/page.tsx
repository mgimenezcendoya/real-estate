'use client';

import { useState, useEffect, useCallback } from 'react';
import { Wrench, Building2, TrendingUp, DollarSign, RefreshCw, ArrowUpDown } from 'lucide-react';
import { api, ExchangeRate } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Formatting ────────────────────────────────────────────────────────────────

function fARS(n: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(n);
}

function fUSD(n: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}

function formatThousands(raw: string): string {
  const [intPart, decPart] = raw.split('.');
  const formatted = (intPart || '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decPart !== undefined ? `${formatted},${decPart}` : formatted;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const TIPOS = [
  { key: 'oficial', label: 'Oficial', sub: 'BCRA' },
  { key: 'mep',     label: 'MEP',     sub: 'Bolsa' },
  { key: 'blue',    label: 'Blue',    sub: 'Informal' },
];

const TIPO_META: Record<string, {
  icon: React.ReactNode;
  iconBg: string;
  iconText: string;
  stripe: string;
  tintBg: string;
  pillBg: string;
  pillText: string;
  pillBorder: string;
  activeTab: string;
}> = {
  oficial: {
    icon: <Building2 size={15} />,
    iconBg: 'bg-blue-50',
    iconText: 'text-blue-600',
    stripe: 'from-blue-500 to-blue-600',
    tintBg: 'bg-blue-50/30',
    pillBg: 'bg-blue-50',
    pillText: 'text-blue-700',
    pillBorder: 'border-blue-200',
    activeTab: 'bg-blue-600 text-white border-blue-600 shadow-sm',
  },
  mep: {
    icon: <TrendingUp size={15} />,
    iconBg: 'bg-violet-50',
    iconText: 'text-violet-600',
    stripe: 'from-violet-500 to-violet-600',
    tintBg: 'bg-violet-50/30',
    pillBg: 'bg-violet-50',
    pillText: 'text-violet-700',
    pillBorder: 'border-violet-200',
    activeTab: 'bg-violet-600 text-white border-violet-600 shadow-sm',
  },
  blue: {
    icon: <DollarSign size={15} />,
    iconBg: 'bg-emerald-50',
    iconText: 'text-emerald-600',
    stripe: 'from-emerald-500 to-emerald-600',
    tintBg: 'bg-emerald-50/30',
    pillBg: 'bg-emerald-50',
    pillText: 'text-emerald-700',
    pillBorder: 'border-emerald-200',
    activeTab: 'bg-emerald-600 text-white border-emerald-600 shadow-sm',
  },
};

// ─── Rate card ─────────────────────────────────────────────────────────────────

function RateCardSkeleton() {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm">
      <div className="rounded-t-2xl overflow-hidden"><div className="h-[3px] bg-gray-100" /></div>
      <div className="px-5 pt-4 pb-3 border-b border-gray-50 flex items-center justify-between">
        <Skeleton className="h-5 w-32 bg-gray-100" />
        <Skeleton className="h-4 w-20 bg-gray-100 rounded-full" />
      </div>
      <div className="px-5 py-5 space-y-4">
        <div className="flex justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-12 bg-gray-100" />
            <Skeleton className="h-7 w-28 bg-gray-100" />
          </div>
          <div className="space-y-1.5 text-right">
            <Skeleton className="h-3 w-12 bg-gray-100 ml-auto" />
            <Skeleton className="h-7 w-28 bg-gray-100" />
          </div>
        </div>
        <Skeleton className="h-4 w-24 bg-gray-100 rounded-full" />
      </div>
    </div>
  );
}

function RateCard({ rate }: { rate: ExchangeRate }) {
  const meta = TIPO_META[rate.tipo] ?? TIPO_META.oficial;
  const spread = rate.compra > 0 ? ((rate.venta - rate.compra) / rate.compra) * 100 : 0;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-200">
      {/* Colored top stripe */}
      <div className="rounded-t-2xl overflow-hidden">
        <div className={cn('h-[3px] bg-gradient-to-r', meta.stripe)} />
      </div>

      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={cn('p-1.5 rounded-lg', meta.iconBg, meta.iconText)}>
            {meta.icon}
          </span>
          <span className="text-sm font-bold text-gray-900">{rate.nombre}</span>
        </div>
        <span className="text-[10px] tabular text-gray-400 bg-gray-50 px-2.5 py-0.5 rounded-full border border-gray-100 font-medium">
          {rate.fecha}
        </span>
      </div>

      {/* Body */}
      <div className={cn('px-5 pt-4 pb-5', meta.tintBg)}>
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Compra</p>
            <p className="text-2xl font-bold tabular text-gray-900 leading-none">{fARS(rate.compra)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Venta</p>
            <p className="text-2xl font-bold tabular text-gray-900 leading-none">{fARS(rate.venta)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-3 border-t border-gray-200/50">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Spread</span>
          <span className={cn('text-[11px] font-bold tabular px-2 py-0.5 rounded-full border', meta.pillBg, meta.pillText, meta.pillBorder)}>
            {spread.toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Simulator ─────────────────────────────────────────────────────────────────

function Simulator({ rates, loading }: { rates: ExchangeRate[]; loading: boolean }) {
  const [direction, setDirection] = useState<'buy' | 'sell'>('buy');
  const [selectedTipo, setSelectedTipo] = useState('mep');
  const [fromAmount, setFromAmount] = useState('100000');

  const selectedRate = rates.find((r) => r.tipo === selectedTipo);
  const price = direction === 'buy' ? (selectedRate?.venta ?? 0) : (selectedRate?.compra ?? 0);
  const parsedFrom = parseFloat(fromAmount) || 0;
  const result = price > 0
    ? direction === 'buy' ? parsedFrom / price : parsedFrom * price
    : 0;

  const fromCurrency = direction === 'buy' ? 'ARS' : 'USD';
  const toCurrency   = direction === 'buy' ? 'USD' : 'ARS';
  const priceLabel   = direction === 'buy' ? 'venta' : 'compra';

  function handleSwap() {
    setDirection(d => d === 'buy' ? 'sell' : 'buy');
    if (result > 0) setFromAmount(String(Math.round(result)));
  }

  const rows = TIPOS.map(({ key, label }) => {
    const r = rates.find(x => x.tipo === key);
    const p = direction === 'buy' ? (r?.venta ?? 0) : (r?.compra ?? 0);
    const res = p > 0 ? (direction === 'buy' ? parsedFrom / p : parsedFrom * p) : 0;
    return { key, label, price: p, result: res };
  });

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="h-[3px] bg-gradient-to-r from-slate-400 to-gray-500" />

      <div className="px-6 pt-5 pb-6 space-y-5">
        {/* Direction toggle */}
        <div className="flex gap-1.5 p-1 bg-gray-100 rounded-xl">
          {[
            { value: 'buy',  label: 'Comprar USD', color: 'bg-blue-600 text-white shadow-sm' },
            { value: 'sell', label: 'Vender USD',  color: 'bg-emerald-600 text-white shadow-sm' },
          ].map(({ value, label, color }) => (
            <button
              key={value}
              type="button"
              onClick={() => setDirection(value as 'buy' | 'sell')}
              className={cn(
                'flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all duration-150',
                direction === value ? color : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tipo pills */}
        <div className="flex gap-2">
          {TIPOS.map(({ key, label, sub }) => {
            const r = rates.find(x => x.tipo === key);
            const p = direction === 'buy' ? r?.venta : r?.compra;
            const active = selectedTipo === key;
            const meta = TIPO_META[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedTipo(key)}
                className={cn(
                  'flex-1 flex flex-col items-center py-2.5 px-2 rounded-xl border text-xs font-semibold transition-all duration-150',
                  active
                    ? cn(meta.pillBg, meta.pillText, meta.pillBorder, 'shadow-sm border')
                    : 'bg-gray-50 text-gray-500 border-gray-100 hover:bg-white hover:border-gray-200'
                )}
              >
                <span className="font-bold">{label}</span>
                <span className={cn('text-[10px] tabular mt-0.5 font-medium', active ? meta.pillText : 'text-gray-400')}>
                  {loading ? '—' : (p ? fARS(p) : '—')}
                </span>
                <span className={cn('text-[9px] mt-0.5', active ? 'opacity-60' : 'text-gray-300')}>
                  {sub}
                </span>
              </button>
            );
          })}
        </div>

        {/* Converter */}
        <div className="space-y-1.5">
          {/* From */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {fromCurrency === 'ARS' ? 'Pagás' : 'Tenés'}
              </span>
              <span className="text-[11px] font-bold text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                {fromCurrency}
              </span>
            </div>
            <input
              type="text"
              inputMode="decimal"
              value={formatThousands(fromAmount)}
              onChange={(e) => {
                const raw = e.target.value.replace(/\./g, '').replace(',', '.');
                const clean = raw.replace(/[^\d.]/g, '').replace(/^(\d*\.?\d*).*$/, '$1');
                setFromAmount(clean);
              }}
              className="w-full bg-transparent text-2xl font-bold tabular text-gray-900 focus:outline-none placeholder:text-gray-300"
              placeholder="0"
            />
          </div>

          {/* Swap */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleSwap}
              className="p-2 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-300 hover:shadow-sm transition-all"
              title="Intercambiar"
            >
              <ArrowUpDown size={14} />
            </button>
          </div>

          {/* To (result) */}
          <div className={cn(
            'rounded-xl border px-4 py-3.5',
            toCurrency === 'USD' ? 'bg-emerald-50/50 border-emerald-100' : 'bg-blue-50/50 border-blue-100'
          )}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Recibís</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-400">precio {priceLabel}</span>
                <span className={cn(
                  'text-[11px] font-bold px-2 py-0.5 rounded-full border',
                  toCurrency === 'USD' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-blue-100 text-blue-700 border-blue-200'
                )}>
                  {toCurrency}
                </span>
              </div>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-40 bg-gray-200" />
            ) : (
              <p className={cn('text-2xl font-bold tabular leading-none', toCurrency === 'USD' ? 'text-emerald-700' : 'text-blue-700')}>
                {toCurrency === 'USD' ? fUSD(result) : fARS(result)}
              </p>
            )}
            {!loading && price > 0 && (
              <p className="text-[11px] text-gray-400 mt-1.5">
                Usando {TIPOS.find(t => t.key === selectedTipo)?.label} {priceLabel} a {fARS(price)}
              </p>
            )}
          </div>
        </div>

        {/* Comparison */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2.5">
            Comparativa — precio {priceLabel}
          </p>
          <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
            {rows.map(({ key, label, price: p, result: res }) => {
              const active = key === selectedTipo;
              const meta = TIPO_META[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedTipo(key)}
                  className={cn(
                    'w-full flex items-center justify-between px-4 py-3 text-sm transition-colors text-left',
                    active ? cn(meta.tintBg) : 'bg-white hover:bg-gray-50'
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={cn('p-1 rounded-md', meta.iconBg, meta.iconText)}>
                      {meta.icon}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{label}</p>
                      <p className="text-[10px] text-gray-400 tabular">{loading ? '—' : (p > 0 ? fARS(p) : '—')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {loading ? (
                      <Skeleton className="h-5 w-24 bg-gray-100" />
                    ) : (
                      <p className={cn(
                        'font-bold tabular text-sm',
                        toCurrency === 'USD' ? 'text-emerald-700' : 'text-blue-700'
                      )}>
                        {toCurrency === 'USD' ? fUSD(res) : fARS(res)}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function ToolsPage() {
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRates = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const data = await api.getExchangeRates();
      setRates(data);
      setLastUpdate(new Date());
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRates();
    const interval = setInterval(() => fetchRates(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchRates]);

  return (
    <div className="flex-1 min-h-screen bg-background p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <div className="relative bg-gradient-to-br from-slate-700 via-slate-600 to-slate-800 rounded-2xl px-6 py-6 overflow-hidden shadow-md">
          <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full bg-white/5" />
          <div className="absolute bottom-0 right-20 w-16 h-16 rounded-full bg-white/5" />

          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Wrench size={22} className="text-white" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/15 border border-white/20 text-white/80 text-[10px] font-semibold uppercase tracking-wider mb-1">
                  Herramientas
                </div>
                <h1 className="text-2xl font-display font-bold text-white leading-tight">Tools</h1>
                <p className="text-sm text-slate-300 mt-0.5">Mercado inmobiliario argentino</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {lastUpdate && (
                <span className="text-xs text-slate-300 hidden sm:block">
                  Actualizado {lastUpdate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button
                type="button"
                onClick={() => fetchRates(true)}
                disabled={refreshing}
                className="p-2 rounded-xl bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 hover:text-white transition-colors disabled:opacity-50"
                title="Actualizar cotizaciones"
              >
                <RefreshCw size={15} className={cn(refreshing && 'animate-spin')} />
              </button>
            </div>
          </div>
        </div>

        {/* Rate cards */}
        <section>
          <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.14em] mb-4 section-divider">
            Tipos de cambio ARS / USD
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {loading ? (
              <><RateCardSkeleton /><RateCardSkeleton /><RateCardSkeleton /></>
            ) : rates.length > 0 ? (
              rates.map((rate) => <RateCard key={rate.tipo} rate={rate} />)
            ) : (
              <div className="col-span-3 py-8 text-center text-sm text-gray-400">
                No se pudieron cargar las cotizaciones. Intentá recargar.
              </div>
            )}
          </div>
        </section>

        {/* Simulator */}
        <section>
          <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.14em] mb-4 section-divider">
            Simulador de conversión
          </h2>
          <div className="max-w-md mx-auto">
            <Simulator rates={rates} loading={loading} />
          </div>
        </section>

      </div>
    </div>
  );
}
