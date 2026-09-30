import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { socketId, updateSocketToken } from '@/lib/socket';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';
export const http = axios.create({ baseURL: BASE, withCredentials: true, timeout: 60_000 });

let accessToken: string | null = null;
let onAuthLost: (() => void) | null = null;
export const setAccessToken = (t: string | null) => {
  accessToken = t;
  if (t) updateSocketToken(t);
};
export const getAccessToken = () => accessToken;
export const setAuthLostHandler = (fn: () => void) => {
  onAuthLost = fn;
};

http.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  const sid = socketId();
  if (sid) cfg.headers['x-socket-id'] = sid;
  return cfg;
});

let refreshing: Promise<string | null> | null = null;
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = axios
      .post(`${BASE}/auth/refresh`, {}, { withCredentials: true })
      .then((r) => {
        const t = r.data?.data?.accessToken ?? null;
        setAccessToken(t);
        return t;
      })
      .catch(() => null)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

http.interceptors.response.use(
  (r) => r,
  async (err: AxiosError<any>) => {
    const cfg = err.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (err.response?.status === 401 && cfg && !cfg._retry && !String(cfg.url).includes('/auth/')) {
      cfg._retry = true;
      const t = await refreshAccessToken();
      if (t) return http(cfg);
      onAuthLost?.();
    }
    return Promise.reject(err);
  },
);

export interface ApiErrorInfo { status: number; code: string; message: string; details?: any }
export function apiError(e: unknown): ApiErrorInfo {
  const ax = e as AxiosError<any>;
  const body = ax?.response?.data?.error;
  if (body) return { status: ax.response!.status, code: body.code, message: body.message, details: body.details };
  if (ax?.code === 'ERR_NETWORK') return { status: 0, code: 'NETWORK', message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบเครือข่าย' };
  return { status: ax?.response?.status ?? 0, code: 'UNKNOWN', message: (e as Error)?.message ?? 'เกิดข้อผิดพลาด' };
}

export const get = <T>(url: string, params?: any) => http.get(url, { params }).then((r) => r.data.data as T);
export const post = <T>(url: string, body?: any, cfg?: AxiosRequestConfig) => http.post(url, body, cfg).then((r) => r.data.data as T);
export const put = <T>(url: string, body?: any) => http.put(url, body).then((r) => r.data.data as T);
export const del = <T>(url: string) => http.delete(url).then((r) => r.data.data as T);
