'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { HardHat, Lock, User, Loader2, Eye, EyeOff } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('Ingresá usuario y contraseña.');
      return;
    }
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Credenciales inválidas.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-[400px] mx-auto">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden animate-fade-in-up">
          <div className="p-8">
            {/* Logo */}
            <div className="flex flex-col items-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-md shadow-indigo-500/20 mb-4">
                <HardHat size={28} className="text-white" />
              </div>
              <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight mb-1">
                REALIA Workspace
              </h1>
              <p className="text-gray-500 text-sm text-center">
                Ingresá con tu cuenta para continuar
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-700">
                  <AlertDescription className="text-sm">{error}</AlertDescription>
                </Alert>
              )}

              {/* Username */}
              <div className="space-y-1.5">
                <label htmlFor="username" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Usuario
                </label>
                <div className={cn(
                  'flex rounded-xl border bg-white overflow-hidden transition-all',
                  'border-gray-200 focus-within:ring-2 focus-within:ring-indigo-500/30 focus-within:border-indigo-400'
                )}>
                  <div className="w-11 flex-shrink-0 flex items-center justify-center text-gray-400 border-r border-gray-200">
                    <User size={16} />
                  </div>
                  <input
                    id="username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ej: admin"
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
                  'border-gray-200 focus-within:ring-2 focus-within:ring-indigo-500/30 focus-within:border-indigo-400'
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
                className="w-full py-5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white border-0 transition-colors rounded-xl mt-2"
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
              Acceso restringido al equipo autorizado.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
