import { ApiClient } from '@/lib/api-client';
import type {
  AwsTestConnectionRequest,
  AwsTestConnectionSuccess,
} from '@/types/deployment.types';

export const awsService = {
  testConnection(request: AwsTestConnectionRequest): Promise<AwsTestConnectionSuccess> {
    return ApiClient.post<AwsTestConnectionSuccess>('/api/v1/aws/test-connection', request);
  },
};
