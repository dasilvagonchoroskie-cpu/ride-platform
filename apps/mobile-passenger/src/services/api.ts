import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { ERROR_CODES } from '@ride/shared';
import { API_URL } from './config';
import { getItem, setItem, STORAGE_KEYS } from './storage';

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly details?: unknown;

  constructor(shape: ApiErrorShape, status?: number) {
    super(shape.message);
    this.name = 'ApiError';
    this.code = shape.code;
    this.status = status;
    this.details = shape.details;
  }

  get isNetworkError(): boolean {
    return this.code === 'NETWORK_ERROR';
  }

  get isUnauthorized(): boolean {
    return (
      this.status === 401 ||
      this.code === ERROR_CODES.UNAUTHORIZED ||
      this.code === ERROR_CODES.TOKEN_EXPIRED ||
      this.code === ERROR_CODES.TOKEN_INVALID
    );
  }
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: ApiErrorShape;
}

let refreshPromise: Promise<string | null> | null = null;

export const http: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await getItem(STORAGE_KEYS.accessToken);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<Envelope<unknown>>) => {
    const status = error.response?.status;
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };

    if (!error.response) {
      return Promise.reject(
        new ApiError({ code: 'NETWORK_ERROR', message: 'Sem conexao com o servidor.' }),
      );
    }

    if (status === 401 && original && !original._retried && !original.url?.includes('/auth/')) {
      original._retried = true;
      const token = await refreshAccessToken();
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return http.request(original);
      }
    }

    const body = error.response.data;
    const shape: ApiErrorShape =
      body && typeof body === 'object' && 'error' in body && body.error
        ? (body.error as ApiErrorShape)
        : { code: `HTTP_${status ?? 0}`, message: error.message };

    return Promise.reject(new ApiError(shape, status));
  },
);

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const refreshToken = await getItem(STORAGE_KEYS.refreshToken);
      if (!refreshToken) return null;

      const { data } = await axios.post<Envelope<{ accessToken: string; refreshToken: string }>>(
        `${API_URL}/api/auth/refresh`,
        { refreshToken },
        { timeout: 15000 },
      );

      if (!data.success || !data.data) return null;

      await setItem(STORAGE_KEYS.accessToken, data.data.accessToken);
      await setItem(STORAGE_KEYS.refreshToken, data.data.refreshToken);
      return data.data.accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/** Desembrulha o envelope { success, data } da API. */
export async function apiRequest<T>(
  method: 'get' | 'post' | 'patch' | 'put' | 'delete',
  url: string,
  payload?: unknown,
): Promise<T> {
  const { data } = await http.request<Envelope<T>>({
    method,
    url,
    ...(method === 'get' || method === 'delete' ? { params: payload } : { data: payload }),
  });

  if (!data.success || data.data === undefined) {
    throw new ApiError(data.error ?? { code: ERROR_CODES.INTERNAL_ERROR, message: 'Resposta invalida.' });
  }

  return data.data;
}

/** Verifica se a API esta acessivel (usado para decidir o modo demonstracao). */
export async function checkApiHealth(timeoutMs = 4000): Promise<boolean> {
  if (!API_URL) return false;
  try {
    await axios.get(`${API_URL}/api/health`, { timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}
