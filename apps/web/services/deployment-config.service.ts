import { ApiClient } from '@/lib/api-client';
import type {
  CustomerConfigInput,
  CustomerConfigResponse,
} from '@/types/deployment.types';

export const configService = {
  create(input: CustomerConfigInput, opts?: { draft?: boolean }): Promise<CustomerConfigResponse> {
    const qs = opts?.draft ? '?draft=true' : '';
    return ApiClient.post<CustomerConfigResponse>(`/api/v1/configs${qs}`, input);
  },

  get(customerId: string): Promise<CustomerConfigResponse> {
    return ApiClient.get<CustomerConfigResponse>(`/api/v1/configs/${customerId}`);
  },

  update(customerId: string, input: CustomerConfigInput, opts?: { draft?: boolean }): Promise<CustomerConfigResponse> {
    const qs = opts?.draft ? '?draft=true' : '';
    return ApiClient.put<CustomerConfigResponse>(`/api/v1/configs/${customerId}${qs}`, input);
  },

  list(): Promise<{ configs: CustomerConfigResponse[] }> {
    return ApiClient.get<{ configs: CustomerConfigResponse[] }>('/api/v1/configs');
  },

  delete(customerId: string): Promise<void> {
    return ApiClient.delete<void>(`/api/v1/configs/${customerId}`);
  },

  validate(input: CustomerConfigInput): Promise<CustomerConfigResponse> {
    return ApiClient.post<CustomerConfigResponse>('/api/v1/configs/validate', input);
  },
};
