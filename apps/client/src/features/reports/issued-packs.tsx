import type { ReportFormatKey, ReportPack } from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/auth/use-auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { download } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { useApiMutation, useApiQuery } from '@/lib/api/query';
import { formatInstantDay } from '@/lib/format';
import { saveFile } from '@/lib/save-file';
import { FORMAT_SHORT } from './labels';

/** While a pack is being generated, check again every few seconds. */
const POLL_MS = 3000;

/** Packs issued or in progress, newest first, with downloads per format. */
export function IssuedPacks({ canManage }: { canManage: boolean }) {
  const packs = useApiQuery(
    'listPacks',
    {},
    {
      refetchInterval: (query) =>
        query.state.data?.some(
          (p) => p.status === 'QUEUED' || p.status === 'GENERATING',
        )
          ? POLL_MS
          : false,
    },
  );
  return (
    <Card aria-labelledby="issued-title">
      <CardHeader titleId="issued-title" title="Issued packs" />
      <CardBody>
        {packs.isPending ? (
          <Skeleton className="h-40" />
        ) : packs.isError ? (
          <ErrorState
            error={packs.error}
            onRetry={() => void packs.refetch()}
          />
        ) : packs.data.length === 0 ? (
          <EmptyState
            className="py-6"
            title="No packs yet"
            description="Packs generated from a locked cycle appear here."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {packs.data.map((pack) => (
              <PackRow key={pack.id} pack={pack} canManage={canManage} />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function PackRow({
  pack,
  canManage,
}: {
  pack: ReportPack;
  canManage: boolean;
}) {
  const { organisation } = useSession();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const regenerate = useApiMutation('regeneratePack', {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['listPacks'] }),
    onError: (e) => setError(errorMessage(e)),
  });

  const get = async (format: ReportFormatKey) => {
    setError(null);
    try {
      const file = await download('downloadPack', {
        params: { id: pack.id },
        query: { format },
      });
      saveFile(file.blob, file.fileName);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const formats = pack.formats.map((f) => FORMAT_SHORT[f]).join(', ');
  const status =
    pack.status === 'READY' && pack.issuedAt
      ? `Issued ${formatInstantDay(pack.issuedAt, organisation.timezone)} · ${formats} · v${pack.version}`
      : `${formats} · v${pack.version}`;

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-ink">{pack.title}</p>
          <p className="text-xs text-ink-muted">{status}</p>
        </div>
        {pack.status === 'QUEUED' || pack.status === 'GENERATING' ? (
          <Badge tone="info">
            {pack.status === 'QUEUED' ? 'Queued' : 'Generating…'}
          </Badge>
        ) : pack.status === 'FAILED' ? (
          <Badge tone="danger">Failed</Badge>
        ) : null}
      </div>
      {pack.status === 'FAILED' && pack.error && (
        <p className="text-xs text-danger">{pack.error}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {pack.available.map((format) => (
          <Button
            key={format}
            size="sm"
            variant="secondary"
            aria-label={`Download ${pack.title} as ${FORMAT_SHORT[format]}`}
            onClick={() => void get(format)}
          >
            Download {FORMAT_SHORT[format]}
          </Button>
        ))}
        {canManage && (pack.status === 'FAILED' || pack.status === 'READY') && (
          <Button
            size="sm"
            variant="ghost"
            loading={regenerate.isPending}
            aria-label={`Generate ${pack.title} again`}
            onClick={() => {
              setError(null);
              regenerate.mutate({ params: { id: pack.id } });
            }}
          >
            {pack.status === 'FAILED' ? 'Try again' : 'Regenerate'}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </li>
  );
}
