import axios, { type AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@apaas/shared/stores';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api';

/**
 * embed 模式标记（iframe 嵌入）：401 不再跳 /login（iframe 内永不渲染登录页），
 * 改为广播事件由 EmbedBridge 转发出站 `apaas:auth-expired`，宿主接管换 token。
 */
const EMBED_AUTH_EXPIRED_EVENT = 'apaas:embed:auth-expired';
let embedMode = false;

export function setEmbedMode(on: boolean): void {
  embedMode = on;
}

export function isEmbedAuthExpiredEventName(name: string): boolean {
  return name === EMBED_AUTH_EXPIRED_EVENT;
}

export const apiClient = axios.create({
  baseURL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器:从 auth store 取 token 加到 Authorization header (JWT)。
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// 响应拦截器:401 清除凭据。embed 模式广播事件出站给宿主；普通模式跳转登录。
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      if (embedMode) {
        window.dispatchEvent(
          new CustomEvent(EMBED_AUTH_EXPIRED_EVENT, { detail: { url: error.config?.url } }),
        );
      } else if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default apiClient;
