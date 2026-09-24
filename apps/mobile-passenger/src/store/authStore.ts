import { create } from 'zustand';
import { API_URL } from '../services/config';
import { apiRequest, ApiError } from '../services/api';
import { getItem, removeItem, setItem, STORAGE_KEYS } from '../services/storage';

export interface SessionUser {
  id: string;
  role: string;
  name: string;
  phone: string;
  email: string | null;
  avatarUrl: string | null;
}

interface AuthState {
  user: SessionUser | null;
  accessToken: string | null;
  ready: boolean;
  loading: boolean;
  error: string | null;
  restore: () => Promise<void>;
  requestOtp: (phone: string) => Promise<{ debugCode?: string }>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  demoLogin: (name: string, phone: string) => Promise<void>;
  updateProfile: (name: string, email?: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

function deviceInfo() {
  return { deviceId: `passenger-${Date.now()}`, platform: 'ANDROID' as const };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  ready: false,
  loading: false,
  error: null,

  async restore() {
    const [token, rawUser] = await Promise.all([
      getItem(STORAGE_KEYS.accessToken),
      getItem(STORAGE_KEYS.user),
    ]);

    set({
      accessToken: token,
      user: rawUser ? (JSON.parse(rawUser) as SessionUser) : null,
      ready: true,
    });
  },

  async requestOtp(phone) {
    set({ loading: true, error: null });
    try {
      const result = await apiRequest<{ expiresIn: number; debugCode?: string }>(
        'post',
        '/auth/otp/request',
        { phone, purpose: 'LOGIN' },
      );
      return { debugCode: result.debugCode };
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Falha ao enviar o codigo.';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  async verifyOtp(phone, code) {
    set({ loading: true, error: null });
    try {
      const result = await apiRequest<{
        accessToken: string;
        refreshToken: string;
        user: SessionUser;
      }>('post', '/auth/otp/verify', {
        phone,
        code,
        purpose: 'LOGIN',
        role: 'PASSENGER',
        device: deviceInfo(),
      });

      await Promise.all([
        setItem(STORAGE_KEYS.accessToken, result.accessToken),
        setItem(STORAGE_KEYS.refreshToken, result.refreshToken),
        setItem(STORAGE_KEYS.user, JSON.stringify(result.user)),
      ]);

      set({ accessToken: result.accessToken, user: result.user });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Codigo invalido.';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  /** Login local (modo demonstracao): nenhuma chamada de rede. */
  async demoLogin(name, phone) {
    const user: SessionUser = {
      id: `demo-${phone}`,
      role: 'PASSENGER',
      name,
      phone,
      email: null,
      avatarUrl: null,
    };

    await Promise.all([
      setItem(STORAGE_KEYS.accessToken, 'demo-token'),
      setItem(STORAGE_KEYS.user, JSON.stringify(user)),
    ]);

    set({ user, accessToken: 'demo-token' });
  },

  async updateProfile(name, email) {
    const current = get().user;
    if (!current) return;

    if (API_URL && get().accessToken !== 'demo-token') {
      try {
        await apiRequest('patch', '/users/me', { name, ...(email ? { email } : {}) });
      } catch {
        // perfil local segue atualizado mesmo se a API falhar
      }
    }

    const user: SessionUser = { ...current, name, email: email ?? current.email };
    await setItem(STORAGE_KEYS.user, JSON.stringify(user));
    set({ user });
  },

  async logout() {
    await Promise.all([
      removeItem(STORAGE_KEYS.accessToken),
      removeItem(STORAGE_KEYS.refreshToken),
      removeItem(STORAGE_KEYS.user),
      removeItem(STORAGE_KEYS.activeRide),
    ]);
    set({ user: null, accessToken: null });
  },

  clearError() {
    set({ error: null });
  },
}));
