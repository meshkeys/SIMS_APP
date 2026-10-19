import { STRATEGY_EDITOR_ROLES } from '@sims/contracts';
import { useSession } from '@/auth/use-auth';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { hasAnyRole } from '@/lib/access';
import { useApiQuery } from '@/lib/api/query';
import { IssuedPacks } from './issued-packs';
import { PackBuilder } from './pack-builder';

const HEADER = {
  eyebrow: 'Reports · Executive & Board reporting',
  title: 'Board pack builder',
  description:
    'Packs are built from a locked cycle snapshot, so numbers match what management approved.',
};

/**
 * Board packs and management reports. The Strategy Office builds and issues
 * them; executives, sponsors, the Board and internal audit read the issued
 * packs (the Board sees its own packs only).
 */
export function ReportsPage() {
  const session = useSession();
  const canBuild = hasAnyRole(session, STRATEGY_EDITOR_ROLES);

  if (!canBuild) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          {...HEADER}
          title="Reports"
          description="Board packs and management reports issued by the Strategy Office."
        />
        <IssuedPacks canManage={false} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader {...HEADER} documentTitle="Board pack builder" />
      <Builder />
      <IssuedPacks canManage />
    </div>
  );
}

function Builder() {
  const snapshots = useApiQuery('listReportSnapshots', {});
  if (snapshots.isPending) {
    return (
      <>
        <output className="sr-only">Loading reporting snapshots…</output>
        <Skeleton className="h-96" />
      </>
    );
  }
  if (snapshots.isError) {
    return (
      <Card>
        <ErrorState
          error={snapshots.error}
          onRetry={() => void snapshots.refetch()}
        />
      </Card>
    );
  }
  if (!snapshots.data.some((s) => s.usable)) {
    return (
      <Card>
        <EmptyState
          title="No locked cycle yet"
          description="Packs are built from a reporting cycle once it is locked. Lock the current cycle when sponsor review ends."
        />
      </Card>
    );
  }
  return <PackBuilder snapshots={snapshots.data} />;
}
