import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { configService } from '@/services/deployment-config.service';
import type { CustomerConfigInput } from '@/types/deployment.types';

const CONFIGS_KEY = ['configs'] as const;

export function useConfigs() {
  return useQuery({
    queryKey: CONFIGS_KEY,
    queryFn: () => configService.list(),
    select: (data) => data.configs,
  });
}

export function useConfig(customerId: string | null) {
  return useQuery({
    queryKey: [...CONFIGS_KEY, customerId],
    queryFn: () => configService.get(customerId!),
    enabled: !!customerId,
  });
}

export function useCreateConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomerConfigInput) => configService.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  });
}

export function useUpdateConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, input }: { customerId: string; input: CustomerConfigInput }) =>
      configService.update(customerId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  });
}

export function useDeleteConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (customerId: string) => configService.delete(customerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  });
}

export function useValidateConfig() {
  return useMutation({
    mutationFn: (input: CustomerConfigInput) => configService.validate(input),
  });
}
