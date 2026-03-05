'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { KeyRound, Loader2, Eye, EyeOff } from 'lucide-react';

interface Props {
  /** Si es true, el modal es bloqueante (primer login). Si es false, es voluntario. */
  forced?: boolean;
  onSuccess: () => void;
  onCancel?: () => void;
}

export default function ChangePasswordModal({ forced = false, onSuccess, onCancel }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) { toast.error('La nueva contraseña debe tener al menos 8 caracteres'); return; }
    if (next !== confirm) { toast.error('Las contraseñas no coinciden'); return; }
    setSaving(true);
    try {
      await api.changePassword(current, next);
      toast.success('Contraseña actualizada correctamente');
      onSuccess();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al cambiar contraseña');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={forced ? 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm' : ''}>
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-sm mx-4 p-6">
        <div className="flex flex-col items-center mb-5">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center mb-3">
            <KeyRound size={22} className="text-blue-700" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Cambiar contraseña</h2>
          {forced && (
            <p className="text-sm text-gray-500 text-center mt-1">
              Tu cuenta requiere que establezcas una nueva contraseña antes de continuar.
            </p>
          )}
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">
              Contraseña actual
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={current}
                onChange={e => setCurrent(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-9 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">
              Nueva contraseña
            </label>
            <div className="relative">
              <input
                type={showNext ? 'text' : 'password'}
                value={next}
                onChange={e => setNext(e.target.value)}
                required
                minLength={8}
                placeholder="Mínimo 8 caracteres"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-9 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowNext(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showNext ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">
              Confirmar nueva contraseña
            </label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={saving || !current || !next || !confirm}
            className="w-full flex items-center justify-center gap-2 mt-2 px-4 py-2.5 text-sm font-semibold bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Cambiar contraseña
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-full text-xs text-gray-400 hover:text-gray-600 py-1"
            >
              Cancelar
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
