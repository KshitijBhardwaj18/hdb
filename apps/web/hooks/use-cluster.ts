import { useMutation, useQuery } from '@tanstack/react-query';
import { clusterService } from '@/services/cluster.service';

export function useSsmSession(customerId: string | null, environment: string | null) {
  return useQuery({
    queryKey: ['ssm-session', customerId, environment],
    queryFn: () => clusterService.getSsmSession(customerId!, environment!),
    enabled: !!customerId && !!environment,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useSsmStatus(customerId: string | null, environment: string | null) {
  return useQuery({
    queryKey: ['ssm-status', customerId, environment],
    queryFn: () => clusterService.getSsmStatus(customerId!, environment!),
    enabled: !!customerId && !!environment,
    retry: false,
  });
}

export function useStartAccessNode() {
  return useMutation({
    mutationFn: ({ customerId, environment }: { customerId: string; environment: string }) =>
      clusterService.startAccessNode(customerId, environment),
  });
}

export function useStopAccessNode() {
  return useMutation({
    mutationFn: ({ customerId, environment }: { customerId: string; environment: string }) =>
      clusterService.stopAccessNode(customerId, environment),
  });
}
