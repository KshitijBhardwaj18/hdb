import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import axios, { isAxiosError } from 'axios';
import { getServerSession } from 'next-auth';
import { getSession, signOut } from 'next-auth/react';
import { envConfig } from '@/config';
import { authOptions } from '@/lib/auth';
import { ApiError } from '@/lib/errors';
import { deepTrim } from '@/utils/string.utils';

/** Maximum retry attempts for transient (5xx / network) errors. */
const MAX_RETRIES = 3;
/** Base delay in ms — doubles each retry. */
const RETRY_BASE_DELAY = 1000;

function isRetryable(err: unknown): boolean {
  if (!isAxiosError(err)) return false;
  // Network errors (no response at all)
  if (!err.response) return true;
  // 5xx server errors
  const status = err.response.status;
  return status >= 500 && status < 600;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ApiClient {
  static async request<T>(config: AxiosRequestConfig): Promise<T> {
    const isServer = typeof window === 'undefined';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const session = isServer ? await getServerSession(authOptions) : await getSession();

        const isFormData = config.data instanceof FormData;

        const reqConfig = { ...config };
        if (reqConfig.data && !isFormData) {
          reqConfig.data = deepTrim(reqConfig.data);
        }
        if (reqConfig.params) {
          reqConfig.params = deepTrim(reqConfig.params);
        }

        const client = axios.create({
          baseURL: envConfig.apiUrl,
          timeout: 30_000,
          headers: {
            ...(reqConfig.data && !isFormData ? { 'Content-Type': 'application/json' } : {}),
            Authorization: `Bearer ${session?.user?.token}`,
          },
        });
        const response: AxiosResponse<T> = await client.request(reqConfig);
        return response.data;
      } catch (err) {
        if (isAxiosError(err)) {
          const status = err.response?.status;

          // 401 — force logout on client side
          if (status === 401 && !isServer) {
            signOut({ callbackUrl: '/login' });
            throw ApiError.fromAxiosError(err);
          }

          // Retryable — wait and try again (except on last attempt)
          if (isRetryable(err) && attempt < MAX_RETRIES) {
            const delay = RETRY_BASE_DELAY * 2 ** attempt;
            await sleep(delay);
            continue;
          }

          throw ApiError.fromAxiosError(err);
        }
        console.error(err);
        throw new ApiError(0, 'INTERNAL_ERROR', 'Something went wrong');
      }
    }
    // Should never reach here, but TypeScript needs it
    throw new ApiError(0, 'INTERNAL_ERROR', 'Request failed after retries');
  }

  static async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>({ method: 'GET', url, params });
  }

  static async post<T, D = unknown>(url: string, data?: D): Promise<T> {
    return this.request<T>({ method: 'POST', url, data });
  }

  static async put<T, D = unknown>(url: string, data?: D): Promise<T> {
    return this.request<T>({ method: 'PUT', url, data });
  }

  static async patch<T, D = unknown>(url: string, data?: D): Promise<T> {
    return this.request<T>({ method: 'PATCH', url, data });
  }

  static async delete<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>({ method: 'DELETE', url, params });
  }
}
