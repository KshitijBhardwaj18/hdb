import { ApiClient } from '@/lib/api-client';
import type {
  AwsTestConnectionRequest,
  AwsTestConnectionSuccess,
  AtlasTestConnectionRequest,
  AtlasTestConnectionSuccess,
} from '@/types/deployment.types';

export const awsService = {
  testConnection(request: AwsTestConnectionRequest): Promise<AwsTestConnectionSuccess> {
    return ApiClient.post<AwsTestConnectionSuccess>('/api/v1/aws/test-connection', request);
  },

  testAtlasConnection(request: AtlasTestConnectionRequest): Promise<AtlasTestConnectionSuccess> {
    return ApiClient.post<AtlasTestConnectionSuccess>('/api/v1/aws/test-atlas-connection', request);
  },
};
