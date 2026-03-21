import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { deploymentService } from '@/services/deployment.service';
import { DeploymentStatus } from '@/types/deployment.types';
import type { DeployRequest, DeploymentEvent } from '@/types/deployment.types';

const DEPLOYMENTS_KEY = ['deployments'] as const;
const EVENTS_KEY = ['deployment-events'] as const;

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

/** Fetch ALL deployments for the current user (across all customers). */
export function useAllDeployments() {
  return useQuery({
    queryKey: [...DEPLOYMENTS_KEY, 'all'],
    queryFn: () => deploymentService.listAll(),
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

/**
 * Poll deployment events from the backend.
 * Returns the accumulated list of events, incrementally fetching only new ones.
 */
export function useDeploymentEvents(
  customerId: string | null,
  environment: string | null,
  enabled: boolean = true,
) {
  const accumulatedRef = useRef<DeploymentEvent[]>([]);
  const sinceRef = useRef<string | undefined>(undefined);

  return useQuery({
    queryKey: [...EVENTS_KEY, customerId, environment],
    queryFn: async () => {
      const resp = await deploymentService.getEvents(
        customerId!,
        environment!,
        sinceRef.current,
      );

      if (resp.events.length > 0) {
        // Append new events (dedup by id)
        const existingIds = new Set(accumulatedRef.current.map((e) => e.id));
        const newEvents = resp.events.filter((e) => !existingIds.has(e.id));
        accumulatedRef.current = [...accumulatedRef.current, ...newEvents];
        // Update cursor to the latest timestamp
        const lastEvent = resp.events[resp.events.length - 1]!;
        sinceRef.current = lastEvent.timestamp;
      }

      return accumulatedRef.current;
    },
    enabled: enabled && !!customerId && !!environment,
    refetchInterval: 3000,
  });
}
