import { ApiClient } from '@/lib/api-client';

export interface SsmNodeStatus {
  enabled: boolean;
  instance_id?: string;
  instance_state?: string;
  availability_zone?: string;
  private_ip?: string;
}

export interface SsmSessionInfo {
  instance_id: string;
  region: string;
  start_session_command: string;
  configure_kubectl_command: string;
  instructions: string[];
}

export interface SsmStatusResponse {
  customer_id: string;
  environment: string;
  cluster_name: string;
  access_node: SsmNodeStatus;
  vpc_endpoints: Record<string, boolean>;
  ready: boolean;
  issues: string[];
}

export interface SsmSessionResponse {
  customer_id: string;
  environment: string;
  session: SsmSessionInfo;
}

export const clusterService = {
  getSsmStatus(customerId: string, environment: string): Promise<SsmStatusResponse> {
    return ApiClient.get<SsmStatusResponse>(`/api/v1/clusters/${customerId}/${environment}/ssm/status`);
  },

  getSsmSession(customerId: string, environment: string): Promise<SsmSessionResponse> {
    return ApiClient.post<SsmSessionResponse>(`/api/v1/clusters/${customerId}/${environment}/ssm/session`);
  },

  startAccessNode(customerId: string, environment: string): Promise<{ status: string; instance_id: string }> {
    return ApiClient.post(`/api/v1/clusters/${customerId}/${environment}/ssm/start`);
  },

  stopAccessNode(customerId: string, environment: string): Promise<{ status: string; instance_id: string }> {
    return ApiClient.post(`/api/v1/clusters/${customerId}/${environment}/ssm/stop`);
  },
};
