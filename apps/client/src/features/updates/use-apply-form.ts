import type { UpdateForm } from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { apiKey } from '@/lib/api/query';

/**
 * After any action on an update: show the server's new copy at once, and
 * refresh everything that summarises it (queues, my updates, dashboard).
 */
export function useApplyForm(form: Pick<UpdateForm, 'period' | 'initiative'>) {
  const queryClient = useQueryClient();
  return async (next: UpdateForm) => {
    queryClient.setQueryData(
      apiKey('getUpdate', {
        params: { periodId: form.period.id, initiativeId: form.initiative.id },
      }),
      next,
    );
    await queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] !== 'getUpdate',
    });
  };
}
