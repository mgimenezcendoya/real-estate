'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { HardHat, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/admin/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? 'Error al restablecer la contraseña');
      }
      setDone(true);
      setTimeout(() => router.push('/'), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-[360px] animate-fade-in-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-md shadow-blue-600/20 mb-4">
            <HardHat size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight mb-1">
            Nueva contraseña
          </h1>
          <p className="text-gray-500 text-sm text-center">
            {done ? 'Contraseña actualizada' : 'Elegí una contraseña segura'}
          </p>
        </div>

        {done ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center mb-6">
            <p className="text-green-800 text-sm font-medium">
              ¡Contraseña actualizada! Redirigiendo al inicio...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-700">
                <AlertDescription className="text-sm">{error}</AlertDescription>
              </Alert>
            )}

            {/* Nueva contraseña */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
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
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="flex-1 min-w-0 bg-transparent px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none text-sm"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="w-11 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Confirmar contraseña */}
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
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repetí la contraseña"
                  className="flex-1 min-w-0 bg-transparent px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none text-sm"
                  disabled={loading}
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !token}
              className="w-full py-5 text-sm font-semibold bg-blue-700 hover:bg-blue-800 text-white border-0 transition-colors rounded-xl mt-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Actualizando...
                </>
              ) : (
                'Actualizar contraseña'
              )}
            </Button>
          </form>
        )}

        {!done && (
          <div className="mt-6 text-center">
            <Link
              href="/forgot-password"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Solicitar un nuevo link
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
