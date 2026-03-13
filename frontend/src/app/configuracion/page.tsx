'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Settings, Wifi, WifiOff, ExternalLink, Loader2, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { createKapsoSetupLink, getKapsoChannel, disconnectKapsoChannel, connectKapsoChannel, type KapsoChannel } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

type Tab = 'general' | 'canales';

export default function ConfiguracionPage() {
  const { organizationName } = useAuth();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>('canales');
  const [channel, setChannel] = useState<KapsoChannel | null>(null);
  const [loadingChannel, setLoadingChannel] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [polling, setPolling] = useState(false);
  const fetchChannel = useCallback(async () => {
    try {
      const ch = await getKapsoChannel();
      setChannel(ch);
      return ch;
    } catch {
      return null;
    } finally {
      setLoadingChannel(false);
    }
  }, []);

  useEffect(() => {
    fetchChannel();
  }, [fetchChannel]);

  // Read Kapso query params after success_redirect_url callback
  useEffect(() => {
    const phoneNumberId = searchParams.get('phone_number_id');
    const displayPhoneNumber = searchParams.get('display_phone_number');
    const businessAccountId = searchParams.get('business_account_id') ?? undefined;

    if (!phoneNumberId) return;

    // Auto-connect channel from Kapso redirect params
    setActiveTab('canales');
    setConnecting(true);
    connectKapsoChannel({
      phone_number_id: phoneNumberId,
      display_phone_number: displayPhoneNumber ?? undefined,
      business_account_id: businessAccountId,
    })
      .then(() => fetchChannel())
      .then(() => toast.success('¡WhatsApp conectado con éxito!'))
      .catch(() => toast.error('Error al registrar el canal'))
      .finally(() => setConnecting(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll every 3s while waiting for onboarding callback (max 2 min = 40 attempts)
  useEffect(() => {
    if (!polling) return;
    let attempts = 0;
    const MAX = 40;
    const interval = setInterval(async () => {
      attempts++;
      const ch = await getKapsoChannel();
      if (ch) {
        setChannel(ch);
        setPolling(false);
        setConnecting(false);
        toast.success('¡WhatsApp conectado con éxito!');
        clearInterval(interval);
        return;
      }
      if (attempts >= MAX) {
        setPolling(false);
        setConnecting(false);
        toast.error('No se detectó la conexión. Volvé a intentarlo.');
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [polling]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { url } = await createKapsoSetupLink();
      window.open(url, '_blank', 'noopener,noreferrer');
      setPolling(true);
    } catch {
      toast.error('No se pudo generar el link de conexión');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!channel) return;
    try {
      await disconnectKapsoChannel(channel.id);
      setChannel(null);
      toast.success('Canal desconectado');
    } catch {
      toast.error('Error al desconectar');
    }
  };

  const orgDisplayName = organizationName ?? 'Tu organización';

  return (
    <div className="flex-1 min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
            <Settings size={20} className="text-gray-600" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold text-gray-900">Configuración</h1>
            <p className="text-sm text-muted-foreground">Administrá tu cuenta y canales</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
          {(['general', 'canales'] as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                activeTab === tab
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {tab === 'canales' ? 'Canales WhatsApp' : 'General'}
            </button>
          ))}
        </div>

        {/* Tab: General */}
        {activeTab === 'general' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Información de la organización</h2>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Building2 size={18} className="text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{orgDisplayName}</p>
                <p className="text-xs text-muted-foreground">Organización activa</p>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Canales WhatsApp */}
        {activeTab === 'canales' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-semibold text-gray-900">Canal de WhatsApp</h2>
                <span className="text-xs text-muted-foreground bg-gray-100 px-2 py-1 rounded-full">vía Kapso</span>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Conectá el número de WhatsApp de tu organización. Los leads recibirán mensajes desde ese número.
              </p>

              {loadingChannel ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" />
                  Verificando conexión...
                </div>
              ) : polling ? (
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <Loader2 size={18} className="animate-spin text-blue-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-800">Esperando confirmación...</p>
                    <p className="text-xs text-blue-600 mt-0.5">Completá los pasos en la ventana que se abrió. Esto puede demorar un minuto.</p>
                  </div>
                </div>
              ) : channel ? (
                <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                      <Wifi size={16} className="text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-green-900">{channel.phone_number}</p>
                      <p className="text-xs text-green-700 mt-0.5">{channel.display_name ?? 'Conectado'} · Kapso</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50"
                  >
                    Desconectar
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 py-6 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                    <WifiOff size={22} className="text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">No hay número conectado</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                      Conectá tu cuenta de WhatsApp Business. El proceso toma menos de 2 minutos.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleConnect}
                    disabled={connecting}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[var(--primary)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
                  >
                    {connecting ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <ExternalLink size={15} />
                    )}
                    Conectar con Kapso
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
