import type { OperationId } from '@sims/contracts';
import {
  QueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
} from '@tanstack/react-query';
import { request } from './client';
import { ApiError } from './errors';
import type { ApiInput, ApiResult } from './types';

/** The typed `request`, seen through a generic id (types are enforced by the hooks' own signatures). */
type AnyRequest = (
  id: OperationId,
  input?: unknown,
  options?: { signal?: AbortSignal },
) => Promise<unknown>;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Strategy data changes on the scale of minutes, not seconds.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        // Retry network and server failures, never answers like 403/404/422.
        retry: (failures, error) =>
          failures < 2 &&
          !(
            error instanceof ApiError &&
            error.status >= 400 &&
            error.status < 500
          ),
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}

/** Cache key for one operation and input: ['getInitiative', { params: { id } }]. */
export const apiKey = <Id extends OperationId>(id: Id, input?: ApiInput<Id>) =>
  input === undefined ? ([id] as const) : ([id, input] as const);

/** Reads one API operation through the query cache. */
export function useApiQuery<Id extends OperationId>(
  id: Id,
  input: ApiInput<Id>,
  options?: Omit<
    UseQueryOptions<ApiResult<Id>, ApiError>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery<ApiResult<Id>, ApiError>({
    queryKey: apiKey(id, input),
    queryFn: ({ signal }) =>
      (request as AnyRequest)(id, input, { signal }) as Promise<ApiResult<Id>>,
    ...options,
  });
}

/** Calls an API operation that changes something. */
export function useApiMutation<Id extends OperationId, Context = unknown>(
  id: Id,
  options?: Omit<
    UseMutationOptions<ApiResult<Id>, ApiError, ApiInput<Id>, Context>,
    'mutationFn'
  >,
) {
  return useMutation<ApiResult<Id>, ApiError, ApiInput<Id>, Context>({
    mutationFn: (input) =>
      (request as AnyRequest)(id, input) as Promise<ApiResult<Id>>,
    ...options,
  });
}
