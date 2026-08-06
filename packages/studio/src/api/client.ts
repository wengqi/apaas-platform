import axios, { type AxiosError, type AxiosResponse } from 'axios';
import { useAuthStore } from '@apaas/shared/stores';

/**
 * Axios 实例。
 * baseURL 为空（相对路径），请求走 Vite dev server proxy：
 *   /api/* → http://localhost:3005/api/* (Gateway 的全局前缀已含 /api)
 * 生产环境可通过 VITE_API_BASE_URL 覆盖为绝对地址。
 */
const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/** 统一 API 响应包裹(与 @apaas/shared ApiResponse 对齐)。 */
export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; fieldErrors?: Record<string, string> };
}

/** 请求拦截器:从 auth store 取 token 加到 Authorization header。 */
client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** 响应拦截器:401 清除凭证并跳转登录页。 */
client.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default client;
