'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { portalApi, setPortalToken, getPortalToken } from '@/lib/api';

type PortalAuthContextValue = {
  userId: string | null;
  email: string | null;
  nombre: string | null;
  reservationId: string | null;
  mustChangePassword: boolean;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setMustChangePassword: (v: boolean) => void;
};

const PortalAuthContext = createContext<PortalAuthContextValue | null>(null);

export function PortalAuthProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [nombre, setNombre] = useState<string | null>(null);
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    const token = getPortalToken();
    if (!token) {
      setUserId(null);
      setLoading(false);
      return;
    }
    try {
      const me = await portalApi.me();
      setUserId(me.user_id);
      setEmail(me.email);
      setNombre(me.nombre || null);
      setReservationId(me.reservation_id || null);
      setMustChangePassword(me.debe_cambiar_password ?? false);
    } catch {
      setPortalToken(null);
      setUserId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const login = useCallback(async (emailInput: string, password: string) => {
    const data = await portalApi.login(emailInput, password);
    setPortalToken(data.token);
    setUserId(data.user_id);
    setEmail(data.email);
    setNombre(data.nombre || null);
    setReservationId(data.reservation_id || null);
    setMustChangePassword(data.debe_cambiar_password ?? false);
  }, []);

  const logout = useCallback(() => {
    setPortalToken(null);
    setUserId(null);
    setEmail(null);
    setNombre(null);
    setReservationId(null);
    setMustChangePassword(false);
  }, []);

  return (
    <PortalAuthContext.Provider value={{
      userId, email, nombre, reservationId,
      mustChangePassword, loading,
      isAuthenticated: !!userId,
      login, logout, setMustChangePassword,
    }}>
      {children}
    </PortalAuthContext.Provider>
  );
}

export function usePortalAuth() {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error('usePortalAuth must be used within PortalAuthProvider');
  return ctx;
}
