'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setAuthToken } from '@/lib/api';

export type UserRole = 'superadmin' | 'admin' | 'gerente' | 'vendedor' | 'lector' | 'reader' | null;

type AuthContextValue = {
  user: string | null;
  role: UserRole;
  nombre: string | null;
  userId: string | null;
  organizationId: string | null;
  organizationName: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isReader: boolean;
  mustChangePassword: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setMustChangePassword: (v: boolean) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [nombre, setNombre] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('realia_token') : null;
    if (!token) {
      setUser(null); setRole(null); setLoading(false);
      return;
    }
    try {
      const me = await api.authMe();
      setUser(me.user || null);
      setRole((me.role as UserRole) || null);
      setNombre(me.nombre || null);
      setUserId(me.user_id || null);
      setOrganizationId(me.organization_id || null);
      setOrganizationName(me.organization_name || null);
      setMustChangePassword(me.debe_cambiar_password ?? false);
      if (!me.user) setAuthToken(null);
    } catch {
      setAuthToken(null);
      setUser(null); setRole(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const login = useCallback(async (username: string, password: string) => {
    const data = await api.login(username, password);
    setAuthToken(data.token);
    setUser(data.user);
    setRole((data.role as UserRole) || 'admin');
    setNombre(data.nombre || null);
    setUserId(data.user_id || null);
    setOrganizationId(data.organization_id || null);
    setOrganizationName(data.organization_name || null);
    setMustChangePassword(data.debe_cambiar_password ?? false);
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    setUser(null); setRole(null); setNombre(null);
    setUserId(null); setOrganizationId(null); setOrganizationName(null);
    setMustChangePassword(false);
  }, []);

  const isAdmin = role === 'superadmin' || role === 'admin';
  const isReader = role === 'lector' || role === 'reader';

  return (
    <AuthContext.Provider value={{
      user, role, nombre, userId, organizationId, organizationName,
      loading, isAuthenticated: !!user, isAdmin, isReader,
      mustChangePassword, setMustChangePassword,
      login, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
