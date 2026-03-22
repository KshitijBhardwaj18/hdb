import { useMutation } from '@tanstack/react-query';
import { awsService } from '@/services/aws.service';
import type { AwsTestConnectionRequest, AtlasTestConnectionRequest } from '@/types/deployment.types';

export function useTestAwsConnection() {
  return useMutation({
    mutationFn: (request: AwsTestConnectionRequest) => awsService.testConnection(request),
  });
}

export function useTestAtlasConnection() {
  return useMutation({
    mutationFn: (request: AtlasTestConnectionRequest) => awsService.testAtlasConnection(request),
  });
}
