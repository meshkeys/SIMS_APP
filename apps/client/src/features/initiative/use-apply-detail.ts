import type { InitiativeDetail } from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { apiKey } from '@/lib/api/query';

/** After any change: show the new detail at once, and refresh lists that include it. */
export function useApplyDetail(initiativeId: string) {
  const queryClient = useQueryClient();
  return async (detail: InitiativeDetail) => {
    queryClient.setQueryData(
      apiKey('getInitiative', { params: { id: initiativeId } }),
      detail,
    );
    await queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] !== 'getInitiative',
    });
  };
}
