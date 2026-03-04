'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setAuthToken } from '@/lib/api';

type Role = 'admin' | 'reader' | null;

type AuthContextValue = {
  user: string | null;
  role: Role;
  loading: boolean;
  isAuthenticated: boolean;
  isReader: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<string | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('realia_token') : null;
    if (!token) {
      setUser(null);
      setRole(null);
      setLoading(false);
      return;
    }
    try {
      const { user: me, role: r } = await api.authMe();
      setUser(me || null);
      setRole((r as Role) || null);
      if (!me) setAuthToken(null);
    } catch {
      setAuthToken(null);
      setUser(null);
      setRole(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = useCallback(async (username: string, password: string) => {
    const { token, user: u, role: r } = await api.login(username, password);
    setAuthToken(token);
    setUser(u);
    setRole((r as Role) || 'admin');
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    setUser(null);
    setRole(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        loading,
        isAuthenticated: !!user,
        isReader: role === 'reader',
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
