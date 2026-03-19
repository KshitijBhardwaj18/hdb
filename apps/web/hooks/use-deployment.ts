import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deploymentService } from '@/services/deployment.service';
import { DeploymentStatus } from '@/types/deployment.types';
import type { DeployRequest } from '@/types/deployment.types';

const DEPLOYMENTS_KEY = ['deployments'] as const;

export function useDeploy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, request }: { customerId: string; request?: DeployRequest }) =>
      deploymentService.deploy(customerId, request),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEPLOYMENTS_KEY }),
  });
}

export function useDeploymentStatus(
  customerId: string | null,
  environment: string | null,
) {
  return useQuery({
    queryKey: [...DEPLOYMENTS_KEY, customerId, environment, 'status'],
    queryFn: () => deploymentService.getStatus(customerId!, environment!),
    enabled: !!customerId && !!environment,
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (
        status === DeploymentStatus.PENDING ||
        status === DeploymentStatus.IN_PROGRESS ||
        status === DeploymentStatus.DESTROYING
      ) {
        return 5000;
      }
      return false;
    },
  });
}

export function useDeployments(customerId: string | null) {
  return useQuery({
    queryKey: [...DEPLOYMENTS_KEY, customerId],
    queryFn: () => deploymentService.list(customerId!),
    enabled: !!customerId,
  });
}

export function useDestroy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, environment }: { customerId: string; environment: string }) =>
      deploymentService.destroy(customerId, environment),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEPLOYMENTS_KEY }),
  });
}
