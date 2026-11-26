import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { User } from '@/lib/types';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: {
    email: string;
    password: string;
    full_name: string;
    target_role?: string;
    organization?: string;
  }) => Promise<User>;
  bootstrapAdmin: (payload: { email: string; password: string; full_name: string }) => Promise<User>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateLocalUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => api.getUser());
  const [loading, setLoading] = useState<boolean>(() => Boolean(api.getToken()));

  const refreshProfile = useCallback(async () => {
    if (!api.getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const profile = await api.getProfile();
      setUser(profile);
      const token = api.getToken();
      if (token) api.setSession(token, profile);
    } catch {
      api.clearSession();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (api.getToken()) {
      refreshProfile();
    } else {
      setLoading(false);
    }
    const onUnauthorized = () => setUser(null);
    window.addEventListener('smarthire:unauthorized', onUnauthorized);
    return () => window.removeEventListener('smarthire:unauthorized', onUnauthorized);
  }, [refreshProfile]);

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    const access = res.tokens?.access || res.token;
    const refresh = res.tokens?.refresh || null;
    api.setSession(access, res.user, refresh);
    setUser(res.user);
    return res.user;
  };

  const register = async (payload: {
    email: string;
    password: string;
    full_name: string;
    target_role?: string;
    organization?: string;
  }) => {
    const res = await api.register(payload);
    const access = res.tokens?.access || res.token;
    const refresh = res.tokens?.refresh || null;
    api.setSession(access, res.user, refresh);
    setUser(res.user);
    return res.user;
  };

  const bootstrapAdmin = async (payload: { email: string; password: string; full_name: string }) => {
    const res = await api.bootstrapAdmin(payload);
    const access = res.tokens?.access || res.token;
    const refresh = res.tokens?.refresh || null;
    api.setSession(access, res.user, refresh);
    setUser(res.user);
    return res.user;
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  const updateLocalUser = (nextUser: User) => {
    setUser(nextUser);
    const token = api.getToken();
    if (token) api.setSession(token, nextUser);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user && api.getToken()),
        loading,
        login,
        register,
        bootstrapAdmin,
        logout,
        refreshProfile,
        updateLocalUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
