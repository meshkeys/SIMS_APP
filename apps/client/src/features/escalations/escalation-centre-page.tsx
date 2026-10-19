import { PROPOSER_ROLES, type RiskView } from '@sims/contracts';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useSession } from '@/auth/use-auth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { AddRiskDialog } from '@/features/updates/add-risk-dialog';
import { hasAnyRole } from '@/lib/access';
import { useApiQuery } from '@/lib/api/query';
import { EscalationPanel } from './escalation-panel';
import { LadderStrip } from './ladder-strip';
import { OpenEscalations } from './open-escalations';
import { RaiseEscalationDialog } from './raise-escalation-dialog';
import { type Cell, RiskHeatmap } from './risk-heatmap';
import { BlockedDependencies, DecisionLog } from './side-panels';

const route = getRouteApi('/app/risks');

const HEADER = {
  eyebrow: 'Risks & escalations · What is preventing execution?',
  title: 'Escalation centre',
};

type Dialog = { kind: 'risk' } | { kind: 'raise'; risk?: RiskView } | null;

/** What is preventing execution, who must decide, and how long it has waited. */
export function EscalationCentrePage() {
  const search = route.useSearch();
  const navigate = useNavigate();
  const session = useSession();
  const [dialog, setDialog] = useState<Dialog>(null);
  const centre = useApiQuery(
    'listEscalations',
    { query: {} },
    { placeholderData: (previous) => previous },
  );
  // Owners, sponsors and the Strategy Office log and raise; the server checks each initiative.
  const canAct = hasAnyRole(session, PROPOSER_ROLES);

  const go = (next: {
    level?: number;
    likelihood?: number;
    impact?: number;
    escalation?: string;
  }) =>
    void navigate({
      to: '/risks',
      search: (prev) => ({ ...prev, ...next }),
      replace: true,
    });

  const header = (
    <PageHeader
      {...HEADER}
      actions={
        canAct && (
          <>
            <Button
              variant="secondary"
              onClick={() => setDialog({ kind: 'risk' })}
            >
              Log risk or issue
            </Button>
            <Button onClick={() => setDialog({ kind: 'raise' })}>
              Raise escalation
            </Button>
          </>
        )
      }
    />
  );

  if (centre.isPending) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <output className="sr-only">Loading the escalation centre…</output>
        <Skeleton className="h-36" />
        <div className="grid gap-6 xl:grid-cols-[2fr_3fr]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }
  if (centre.isError) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card>
          <ErrorState
            error={centre.error}
            onRetry={() => void centre.refetch()}
            title="The escalation centre could not be loaded"
          />
        </Card>
      </div>
    );
  }

  const data = centre.data;
  const level = data.ladder.find((l) => l.level === search.level);
  const items = level
    ? data.items.filter((i) => i.level === level.level)
    : data.items;
  const cell: Cell | undefined =
    search.likelihood && search.impact
      ? { likelihood: search.likelihood, impact: search.impact }
      : undefined;

  return (
    <div
      className="flex flex-col gap-6"
      aria-busy={centre.isFetching || undefined}
    >
      {header}
      <LadderStrip
        centre={data}
        selected={level?.level}
        onSelect={(next) => go({ level: next })}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <RiskHeatmap
          cell={cell}
          onSelect={(next) =>
            go({ likelihood: next?.likelihood, impact: next?.impact })
          }
          onEscalate={(risk) => setDialog({ kind: 'raise', risk })}
          canEscalate={canAct}
        />
        <div className="flex min-w-0 flex-col gap-6">
          <OpenEscalations
            items={items}
            level={level}
            selectedId={search.escalation}
            onOpen={(id) => go({ escalation: id })}
            onClearLevel={() => go({ level: undefined })}
          />
          {search.escalation && (
            <EscalationPanel
              key={search.escalation}
              escalationId={search.escalation}
              ladder={data.ladder}
            />
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <BlockedDependencies />
        <DecisionLog />
      </div>

      {dialog?.kind === 'risk' && (
        <AddRiskDialog
          allowPortfolio={data.can.raisePortfolio}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'raise' && (
        <RaiseEscalationDialog
          risk={dialog.risk}
          allowPortfolio={data.can.raisePortfolio}
          onClose={() => setDialog(null)}
          onRaised={(escalation) => {
            setDialog(null);
            go({ escalation: escalation.id, level: undefined });
          }}
        />
      )}
    </div>
  );
}
