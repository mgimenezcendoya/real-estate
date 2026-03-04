'use client';

import { useState, useEffect, useCallback } from 'react';
import { Wrench, Building2, TrendingUp, DollarSign, RefreshCw, ArrowUpDown } from 'lucide-react';
import { api, ExchangeRate } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

function parseNum(s: string): number {
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const TIPOS = [
  { key: 'oficial', label: 'Oficial', sub: 'BCRA' },
  { key: 'mep', label: 'MEP', sub: 'Bolsa' },
  { key: 'blue', label: 'Blue', sub: 'Informal' },
];

const TIPO_ICON: Record<string, React.ReactNode> = {
  oficial: <Building2 size={15} />,
  mep: <TrendingUp size={15} />,
  blue: <DollarSign size={15} />,
};

const TIPO_COLOR: Record<string, string> = {
  oficial: 'text-blue-600',
  mep: 'text-violet-600',
  blue: 'text-emerald-600',
};

const TIPO_BG: Record<string, string> = {
  oficial: 'bg-blue-50 border-blue-100',
  mep: 'bg-violet-50 border-violet-100',
  blue: 'bg-emerald-50 border-emerald-100',
};

const TIPO_ACTIVE: Record<string, string> = {
  oficial: 'bg-blue-600 text-white border-blue-600',
  mep: 'bg-violet-600 text-white border-violet-600',
  blue: 'bg-emerald-600 text-white border-emerald-600',
};

// ─── Rate card ─────────────────────────────────────────────────────────────────

function RateCardSkeleton() {
  return (
    <Card className="glass">
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-28" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between">
          <div className="space-y-1">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-6 w-24" />
          </div>
          <div className="space-y-1 text-right">
            <Skeleton className="h-3 w-10 ml-auto" />
            <Skeleton className="h-6 w-24" />
          </div>
        </div>
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  );
}

function RateCard({ rate }: { rate: ExchangeRate }) {
  const spread = rate.compra > 0 ? ((rate.venta - rate.compra) / rate.compra) * 100 : 0;
  return (
    <Card className="glass hover-lift transition-all">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn('p-1.5 rounded-lg', TIPO_BG[rate.tipo], TIPO_COLOR[rate.tipo])}>
              {TIPO_ICON[rate.tipo] ?? <DollarSign size={15} />}
            </span>
            <CardTitle className="text-sm font-semibold text-foreground">{rate.nombre}</CardTitle>
          </div>
          <span className="text-[10px] tabular text-muted-foreground">{rate.fecha}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Compra</p>
            <p className="text-xl font-bold tabular text-green-600">{fARS(rate.compra)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Venta</p>
            <p className="text-xl font-bold tabular text-red-500">{fARS(rate.venta)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 pt-0.5 border-t border-gray-100">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Spread</span>
          <span className="text-xs font-semibold text-amber-600 tabular">{spread.toFixed(2)}%</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Simulator ─────────────────────────────────────────────────────────────────

// direction: 'buy' = tengo ARS, quiero USD (uso venta)
//            'sell' = tengo USD, quiero ARS (uso compra)

// Format a raw numeric string with thousands separator (Argentine locale: 1.000.000)
function formatThousands(raw: string): string {
  // raw is digits + optional decimal point
  const [intPart, decPart] = raw.split('.');
  const formatted = (intPart || '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decPart !== undefined ? `${formatted},${decPart}` : formatted;
}

function Simulator({ rates, loading }: { rates: ExchangeRate[]; loading: boolean }) {
  const [direction, setDirection] = useState<'buy' | 'sell'>('buy');
  const [selectedTipo, setSelectedTipo] = useState('mep');
  // Raw numeric string (no thousand separators) — e.g. "100000"
  const [fromAmount, setFromAmount] = useState('100000');

  const selectedRate = rates.find((r) => r.tipo === selectedTipo);

  // buy:  ARS → USD  (uses venta — the bank sells USD to you)
  // sell: USD → ARS  (uses compra — the bank buys USD from you)
  const price = direction === 'buy'
    ? (selectedRate?.venta ?? 0)
    : (selectedRate?.compra ?? 0);

  // fromAmount is stored with dot as decimal separator ("1000.5") — use parseFloat directly.
  // parseNum is only for Argentine-formatted strings (dots as thousand sep).
  const parsedFrom = parseFloat(fromAmount) || 0;
  const result = price > 0
    ? direction === 'buy'
      ? parsedFrom / price   // ARS / venta = USD
      : parsedFrom * price   // USD * compra = ARS
    : 0;

  const fromCurrency = direction === 'buy' ? 'ARS' : 'USD';
  const toCurrency = direction === 'buy' ? 'USD' : 'ARS';

  function handleSwap() {
    // swap direction and use the current result as the new "from"
    setDirection(d => d === 'buy' ? 'sell' : 'buy');
    if (result > 0) {
      setFromAmount(String(Math.round(result)));
    }
  }

  // Comparison: for each tipo, compute result using same direction/operation
  const rows = TIPOS.map(({ key, label }) => {
    const r = rates.find(x => x.tipo === key);
    const p = direction === 'buy' ? (r?.venta ?? 0) : (r?.compra ?? 0);
    const res = p > 0 ? (direction === 'buy' ? parsedFrom / p : parsedFrom * p) : 0;
    return { key, label, price: p, result: res, date: r?.fecha };
  });

  const priceLabel = direction === 'buy' ? 'venta' : 'compra';

  return (
    <Card className="glass">
      <CardContent className="pt-6 space-y-5">

        {/* Direction toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDirection('buy')}
            className={cn(
              'flex-1 py-2 px-4 rounded-xl text-sm font-semibold border transition-all duration-150',
              direction === 'buy'
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
            )}
          >
            Comprar USD
          </button>
          <button
            type="button"
            onClick={() => setDirection('sell')}
            className={cn(
              'flex-1 py-2 px-4 rounded-xl text-sm font-semibold border transition-all duration-150',
              direction === 'sell'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
            )}
          >
            Vender USD
          </button>
        </div>

        {/* Tipo pills */}
        <div className="flex gap-2">
          {TIPOS.map(({ key, label, sub }) => {
            const r = rates.find(x => x.tipo === key);
            const p = direction === 'buy' ? r?.venta : r?.compra;
            const active = selectedTipo === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedTipo(key)}
                className={cn(
                  'flex-1 flex flex-col items-center py-2 px-3 rounded-xl border text-xs font-semibold transition-all duration-150',
                  active
                    ? TIPO_ACTIVE[key]
                    : cn('bg-white text-gray-600 hover:text-gray-900', TIPO_BG[key] && `hover:${TIPO_BG[key]}`, 'border-gray-200 hover:border-gray-300')
                )}
              >
                <span>{label}</span>
                <span className={cn('text-[10px] font-medium tabular mt-0.5', active ? 'opacity-80' : 'text-muted-foreground')}>
                  {loading ? '—' : (p ? fARS(p) : '—')}
                </span>
                <span className={cn('text-[9px] mt-0.5', active ? 'opacity-60' : 'text-muted-foreground/60')}>
                  {sub}
                </span>
              </button>
            );
          })}
        </div>

        {/* Converter boxes */}
        <div className="space-y-2">
          {/* From box */}
          <div className="relative rounded-2xl border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {fromCurrency === 'ARS' ? 'Pagás' : 'Tenés'}
              </span>
              <Badge variant="outline" className="text-xs font-bold">{fromCurrency}</Badge>
            </div>
            <input
              type="text"
              inputMode="decimal"
              value={formatThousands(fromAmount)}
              onChange={(e) => {
                // Strip thousand separators (dots in es-AR) and normalize decimal
                const raw = e.target.value
                  .replace(/\./g, '')   // remove thousand sep dots
                  .replace(',', '.');   // normalize decimal comma → dot
                  // Keep only digits and at most one decimal point
                const clean = raw.replace(/[^\d.]/g, '').replace(/^(\d*\.?\d*).*$/, '$1');
                setFromAmount(clean);
              }}
              className="w-full bg-transparent text-3xl font-bold tabular text-foreground focus:outline-none placeholder:text-muted-foreground/40"
              placeholder="0"
            />
          </div>

          {/* Swap button */}
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={handleSwap}
              className="p-2 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-300 hover:shadow-sm transition-all"
              title="Intercambiar dirección"
            >
              <ArrowUpDown size={15} />
            </button>
          </div>

          {/* To box (result) */}
          <div className="relative rounded-2xl border border-border bg-white p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {toCurrency === 'USD' ? 'Recibís' : 'Recibís'}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">precio {priceLabel}</span>
                <Badge variant="outline" className="text-xs font-bold">{toCurrency}</Badge>
              </div>
            </div>
            {loading ? (
              <Skeleton className="h-9 w-48" />
            ) : (
              <p className={cn(
                'text-3xl font-bold tabular',
                toCurrency === 'USD' ? 'text-emerald-600' : 'text-blue-600'
              )}>
                {toCurrency === 'USD' ? fUSD(result) : fARS(result)}
              </p>
            )}
            {!loading && price > 0 && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Usando {TIPOS.find(t => t.key === selectedTipo)?.label} {priceLabel} a {fARS(price)}
              </p>
            )}
          </div>
        </div>

        {/* Comparison table */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Comparativa — precio {priceLabel}
          </p>
          <div className="overflow-hidden rounded-xl border border-border divide-y divide-border">
            {rows.map(({ key, label, price: p, result: res }) => {
              const active = key === selectedTipo;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedTipo(key)}
                  className={cn(
                    'w-full flex items-center justify-between px-4 py-3 text-sm transition-colors text-left',
                    active ? 'bg-accent/40' : 'hover:bg-muted/40'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn('p-1 rounded-md', TIPO_BG[key], TIPO_COLOR[key])}>
                      {TIPO_ICON[key]}
                    </span>
                    <div>
                      <p className={cn('font-semibold', active ? 'text-foreground' : 'text-gray-700')}>{label}</p>
                      <p className="text-[10px] text-muted-foreground tabular">
                        {loading ? '—' : (p > 0 ? fARS(p) : '—')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {loading ? (
                      <Skeleton className="h-5 w-28" />
                    ) : (
                      <p className={cn(
                        'font-bold tabular',
                        active ? 'text-foreground' : 'text-gray-600',
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

      </CardContent>
    </Card>
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
      // silent — keep previous data
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
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shadow-sm">
              <Wrench size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-foreground">Tools</h1>
              <p className="text-sm text-muted-foreground">Herramientas para el mercado inmobiliario argentino</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {lastUpdate && (
              <span className="text-xs text-muted-foreground hidden sm:block">
                Actualizado {lastUpdate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              type="button"
              onClick={() => fetchRates(true)}
              disabled={refreshing}
              className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
              title="Actualizar cotizaciones"
            >
              <RefreshCw size={15} className={cn(refreshing && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* Rate cards */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Tipos de cambio ARS / USD
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {loading ? (
              <>
                <RateCardSkeleton />
                <RateCardSkeleton />
                <RateCardSkeleton />
              </>
            ) : rates.length > 0 ? (
              rates.map((rate) => <RateCard key={rate.tipo} rate={rate} />)
            ) : (
              <div className="col-span-3 py-8 text-center text-sm text-muted-foreground">
                No se pudieron cargar las cotizaciones. Intentá recargar.
              </div>
            )}
          </div>
        </section>

        {/* Simulator */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Simulador de conversión
          </h2>
          <div className="max-w-md">
            <Simulator rates={rates} loading={loading} />
          </div>
        </section>

      </div>
    </div>
  );
}
