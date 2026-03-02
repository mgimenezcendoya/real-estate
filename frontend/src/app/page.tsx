'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { HardHat, Lock, User, Loader2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="min-h-screen w-full flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] pointer-events-none mix-blend-overlay" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[120px] -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px] translate-y-1/2 pointer-events-none" />

      <div className="relative z-10 w-full max-w-[420px] mx-auto flex justify-center">
        {/* Card */}
        <div className="glass-elevated rounded-3xl border border-[rgba(255,255,255,0.08)] shadow-2xl overflow-hidden w-full">
          <div className="p-10">
            {/* Logo & title */}
            <div className="flex flex-col items-center mb-10">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25 mb-5">
                <HardHat size={32} className="text-white" />
              </div>
              <h1 className="text-2xl font-display font-bold text-white tracking-tight mb-1">
                REALIA Workspace
              </h1>
              <p className="text-[#94A3B8] text-sm text-center">
                Ingresá con tu cuenta para continuar
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm">
                  <AlertCircle size={18} className="flex-shrink-0 text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="username" className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">
                  Usuario
                </label>
                <div className="flex rounded-xl border border-white/10 bg-white/5 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:border-indigo-500/30 transition-all">
                  <div className="w-12 flex-shrink-0 flex items-center justify-center text-[#94A3B8] border-r border-white/10">
                    <User size={18} aria-hidden />
                  </div>
                  <input
                    id="username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ej: admin"
                    className={clsx(
                      'flex-1 min-w-0 bg-transparent px-4 py-3.5 text-white placeholder:text-[#64748B]',
                      'focus:outline-none border-0'
                    )}
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">
                  Contraseña
                </label>
                <div className="flex rounded-xl border border-white/10 bg-white/5 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:border-indigo-500/30 transition-all">
                  <div className="w-12 flex-shrink-0 flex items-center justify-center text-[#94A3B8] border-r border-white/10">
                    <Lock size={18} aria-hidden />
                  </div>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Ej: admin"
                    className={clsx(
                      'flex-1 min-w-0 bg-transparent px-4 py-3.5 text-white placeholder:text-[#64748B]',
                      'focus:outline-none border-0'
                    )}
                    disabled={loading}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={clsx(
                  'w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-white transition-all',
                  'bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500',
                  'shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_25px_rgba(99,102,241,0.5)]',
                  'disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none'
                )}
              >
                {loading ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Ingresando...
                  </>
                ) : (
                  'Ingresar'
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-[11px] text-[#64748B]">
              Acceso restringido al equipo autorizado.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
