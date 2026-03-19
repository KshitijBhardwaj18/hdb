import { useMutation } from '@tanstack/react-query';
import { awsService } from '@/services/aws.service';
import type { AwsTestConnectionRequest } from '@/types/deployment.types';

export function useTestAwsConnection() {
  return useMutation({
    mutationFn: (request: AwsTestConnectionRequest) => awsService.testConnection(request),
  });
}
