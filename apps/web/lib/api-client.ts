import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import axios, { isAxiosError } from 'axios';
import { getServerSession } from 'next-auth';
import { getSession } from 'next-auth/react';
import { envConfig } from '@/config';
import { authOptions } from '@/lib/auth';
import { deepTrim } from '@/utils/string.utils';

export class ApiClient {
  static async request<T>(config: AxiosRequestConfig): Promise<T> {
    try {
      const isServer = typeof window === 'undefined';
      const session = isServer ? await getServerSession(authOptions) : await getSession();

      const isFormData = config.data instanceof FormData;

      if (config.data && !isFormData) {
        config.data = deepTrim(config.data);
      }
      if (config.params) {
        config.params = deepTrim(config.params);
      }

      const client = axios.create({
        baseURL: envConfig.apiUrl,
        headers: {
          ...(config.data && !isFormData ? { 'Content-Type': 'application/json' } : {}),
          Authorization: `Bearer ${session?.user?.token}`,
        },
      });
      const response: AxiosResponse<T> = await client.request(config);
      return response.data;
    } catch (err) {
      if (isAxiosError(err)) {
        const data = err.response?.data;
        const message = data?.message || data?.detail || 'Something went wrong';
        throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
      }
      console.log(err);
      throw new Error('Something went wrong');
    }
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
