import { ApiClient } from '@/lib/api-client';
import type {
  CustomerDeployment,
  DeploymentEventsResponse,
  DeploymentResponse,
  DeployRequest,
  DestroyRequest,
} from '@/types/deployment.types';

export const deploymentService = {
  deploy(customerId: string, request: DeployRequest = {}): Promise<DeploymentResponse> {
    return ApiClient.post<DeploymentResponse>(`/api/v1/deployments/${customerId}`, request);
  },

  getStatus(customerId: string, environment: string): Promise<CustomerDeployment> {
    return ApiClient.get<CustomerDeployment>(
      `/api/v1/deployments/${customerId}/${environment}/status`,
    );
  },

  list(customerId: string): Promise<CustomerDeployment[]> {
    return ApiClient.get<CustomerDeployment[]>(`/api/v1/deployments/${customerId}`);
  },

  listAll(): Promise<CustomerDeployment[]> {
    return ApiClient.get<CustomerDeployment[]>('/api/v1/deployments');
  },

  getEvents(customerId: string, environment: string, since?: string): Promise<DeploymentEventsResponse> {
    const params: Record<string, string> = {};
    if (since) params.since = since;
    return ApiClient.get<DeploymentEventsResponse>(
      `/api/v1/deployments/${customerId}/${environment}/events`,
      params,
    );
  },

  destroy(customerId: string, environment: string): Promise<DeploymentResponse> {
    return ApiClient.post<DeploymentResponse>(
      `/api/v1/deployments/${customerId}/${environment}/destroy`,
      { confirm: true } satisfies DestroyRequest,
    );
  },
};
