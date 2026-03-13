'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { portalApi } from '@/lib/api';
import { toast } from 'sonner';
import { Home, Lock, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const LOGIN_BG =
  'https://drdrdbvsxodeihzhmyak.supabase.co/storage/v1/object/public/real-state/assets/login-bg.png';

export default function PortalChangePasswordPage() {
  const router = useRouter();
  const { setMustChangePassword } = usePortalAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (next.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setLoading(true);
    try {
      await portalApi.changePassword(current, next);
      setMustChangePassword(false);
      toast.success('Contraseña actualizada');
      router.replace('/portal/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex">

      {/* ── DESKTOP: left image panel ── */}
      <div
        className="hidden lg:flex lg:flex-1 relative overflow-hidden"
        style={{ backgroundImage: `url(${LOGIN_BG})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-black/50 via-black/25 to-transparent" />
        <div className="relative z-10 flex flex-col justify-end p-12">
          <div className="mb-3">
            <span className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/20 tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              Portal del Comprador
            </span>
          </div>
          <h2 className="text-4xl font-display font-bold text-white tracking-tight leading-tight mb-2">
            Tu hogar,<br />en cada detalle
          </h2>
          <p className="text-white/70 text-sm max-w-xs">
            Seguí el avance de obra y tu plan de pagos desde un solo lugar.
          </p>
        </div>
      </div>

      {/* ── DESKTOP: right form panel ── */}
      <div className="hidden lg:flex w-[460px] flex-shrink-0 items-center justify-center p-8 bg-white">
        <FormCard
          current={current} setCurrent={setCurrent}
          next={next} setNext={setNext}
          confirm={confirm} setConfirm={setConfirm}
          error={error} loading={loading}
          onSubmit={handleSubmit}
        />
      </div>

      {/* ── MOBILE: full-screen image + card from bottom ── */}
      <div className="lg:hidden relative w-full min-h-screen flex flex-col justify-end">
        <div
          className="absolute inset-0"
          style={{ backgroundImage: `url(${LOGIN_BG})`, backgroundSize: 'cover', backgroundPosition: 'center 30%' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/70" />
        <div className="relative z-10 px-6 pb-6 pt-16 flex flex-col gap-2">
          <span className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/20 tracking-wide self-start">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            Portal del Comprador
          </span>
          <h2 className="text-3xl font-display font-bold text-white tracking-tight leading-tight">
            Tu hogar,<br />en cada detalle
          </h2>
          <p className="text-white/70 text-sm">
            Seguí el avance de obra y tu plan de pagos.
          </p>
        </div>
        <div className="relative z-10 bg-white rounded-t-3xl px-6 pt-8 pb-10 shadow-2xl">
          <FormCard
            current={current} setCurrent={setCurrent}
            next={next} setNext={setNext}
            confirm={confirm} setConfirm={setConfirm}
            error={error} loading={loading}
            onSubmit={handleSubmit}
          />
        </div>
      </div>

    </div>
  );
}

interface FormCardProps {
  current: string;
  setCurrent: (v: string) => void;
  next: string;
  setNext: (v: string) => void;
  confirm: string;
  setConfirm: (v: string) => void;
  error: string | null;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

function FormCard({
  current, setCurrent,
  next, setNext,
  confirm, setConfirm,
  error, loading, onSubmit,
}: FormCardProps) {
  return (
    <div className="w-full max-w-[360px] mx-auto animate-fade-in-up">
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-md shadow-blue-600/20 mb-4">
          <Home size={26} className="text-white" />
        </div>
        <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight mb-1">
          REALIA
        </h1>
        <p className="text-gray-500 text-sm text-center">
          Por seguridad, creá una contraseña personal antes de continuar
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-700">
            <AlertDescription className="text-sm">{error}</AlertDescription>
          </Alert>
        )}

        {/* Current password */}
        <div className="space-y-1.5">
          <label htmlFor="current" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Contraseña temporal
          </label>
          <div className={cn(
            'flex rounded-xl border bg-white overflow-hidden transition-all',
            'border-gray-200 focus-within:ring-2 focus-within:ring-blue-600/30 focus-within:border-blue-500'
          )}>
            <div className="w-11 flex-shrink-0 flex items-center justify-center text-gray-400 border-r border-gray-200">
              <Lock size={16} />
            </div>
            <input
              id="current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="La que te enviaron"
              className="flex-1 min-w-0 bg-transparent px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none text-sm"
              disabled={loading}
            />
          </div>
        </div>

        {/* New password */}
        <div className="space-y-1.5">
          <label htmlFor="next" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Nueva contraseña
          </label>
          <div className={cn(
            'flex rounded-xl border bg-white overflow-hidden transition-all',
            'border-gray-200 focus-within:ring-2 focus-within:ring-blue-600/30 focus-within:border-blue-500'
          )}>
            <div className="w-11 flex-shrink-0 flex items-center justify-center text-gray-400 border-r border-gray-200">
              <Lock size={16} />
            </div>
            <input
              id="next"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="flex-1 min-w-0 bg-transparent px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none text-sm"
              disabled={loading}
            />
          </div>
        </div>

        {/* Confirm password */}
        <div className="space-y-1.5">
          <label htmlFor="confirm" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Confirmar contraseña
          </label>
          <div className={cn(
            'flex rounded-xl border bg-white overflow-hidden transition-all',
            'border-gray-200 focus-within:ring-2 focus-within:ring-blue-600/30 focus-within:border-blue-500'
          )}>
            <div className="w-11 flex-shrink-0 flex items-center justify-center text-gray-400 border-r border-gray-200">
              <Lock size={16} />
            </div>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repetí la nueva contraseña"
              className="flex-1 min-w-0 bg-transparent px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none text-sm"
              disabled={loading}
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading || !current || !next || !confirm}
          className="w-full py-5 text-sm font-semibold bg-blue-700 hover:bg-blue-800 text-white border-0 transition-colors rounded-xl mt-2"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin mr-2" />
              Guardando...
            </>
          ) : (
            'Guardar contraseña'
          )}
        </Button>
      </form>

      <p className="mt-5 text-center text-[11px] text-gray-400">
        Acceso exclusivo para compradores registrados.
      </p>
    </div>
  );
}
