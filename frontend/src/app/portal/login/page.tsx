'use client';

import { useState } from 'react';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { Home, Lock, Mail, Loader2, Eye, EyeOff } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const LOGIN_BG =
  'https://drdrdbvsxodeihzhmyak.supabase.co/storage/v1/object/public/real-state/assets/login-bg.png';

export default function PortalLoginPage() {
  const { login } = usePortalAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Ingresá tu email y contraseña.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Credenciales inválidas.');
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
          email={email} setEmail={setEmail}
          password={password} setPassword={setPassword}
          showPassword={showPassword} setShowPassword={setShowPassword}
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
            email={email} setEmail={setEmail}
            password={password} setPassword={setPassword}
            showPassword={showPassword} setShowPassword={setShowPassword}
            error={error} loading={loading}
            onSubmit={handleSubmit}
          />
        </div>
      </div>

    </div>
  );
}

interface FormCardProps {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  error: string | null;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

function FormCard({
  email, setEmail,
  password, setPassword,
  showPassword, setShowPassword,
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
          Portal del Comprador — ingresá con tu cuenta
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-700">
            <AlertDescription className="text-sm">{error}</AlertDescription>
          </Alert>
        )}

        {/* Email */}
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Email
          </label>
          <div className={cn(
            'flex rounded-xl border bg-white overflow-hidden transition-all',
            'border-gray-200 focus-within:ring-2 focus-within:ring-blue-600/30 focus-within:border-blue-500'
          )}>
            <div className="w-11 flex-shrink-0 flex items-center justify-center text-gray-400 border-r border-gray-200">
              <Mail size={16} />
            </div>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="flex-1 min-w-0 bg-transparent px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none text-sm"
              disabled={loading}
            />
          </div>
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Contraseña
          </label>
          <div className={cn(
            'flex rounded-xl border bg-white overflow-hidden transition-all',
            'border-gray-200 focus-within:ring-2 focus-within:ring-blue-600/30 focus-within:border-blue-500'
          )}>
            <div className="w-11 flex-shrink-0 flex items-center justify-center text-gray-400 border-r border-gray-200">
              <Lock size={16} />
            </div>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="flex-1 min-w-0 bg-transparent px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none text-sm"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="w-11 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              tabIndex={-1}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full py-5 text-sm font-semibold bg-blue-700 hover:bg-blue-800 text-white border-0 transition-colors rounded-xl mt-2"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin mr-2" />
              Ingresando...
            </>
          ) : (
            'Ingresar'
          )}
        </Button>
      </form>

      <p className="mt-5 text-center text-[11px] text-gray-400">
        Acceso exclusivo para compradores registrados.
      </p>
    </div>
  );
}
