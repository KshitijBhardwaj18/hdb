import { ApiClient } from '@/lib/api-client';
import type {
  CustomerDeployment,
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

  destroy(customerId: string, environment: string): Promise<DeploymentResponse> {
    return ApiClient.post<DeploymentResponse>(
      `/api/v1/deployments/${customerId}/${environment}/destroy`,
      { confirm: true } satisfies DestroyRequest,
    );
  },
};
