import {
  type ChangeRequestView,
  type InitiativeDetail,
  type InitiativeStatus,
} from '@sims/contracts';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { Tabs } from 'radix-ui';
import { useEffect, useState } from 'react';
import { useSession } from '@/auth/use-auth';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useApiQuery } from '@/lib/api/query';
import { formatInstantDate } from '@/lib/format';
import { ClearOverrideDialog, OverrideDialog, StatusDialog } from './dialogs';
import {
  DeleteMilestoneDialog,
  EditDetailsDialog,
  EditObjectivesDialog,
  MilestoneDialog,
} from './edit-dialogs';
import { TaskBoard } from './task-board';
import { FactsStrip, InitiativeHeader } from './initiative-header';
import { INITIATIVE_TABS, type InitiativeTab, STATUS_LABELS } from './labels';
import {
  ActivityCard,
  DependenciesCard,
  DependencyList,
  ExecutionCard,
  ImpactCard,
  MilestonesCard,
  MilestonesTable,
  ProgressCard,
  RiskList,
  RisksCard,
  WhyThisStatus,
} from './overview';

const route = getRouteApi('/app/initiatives/$id');

type Milestone = InitiativeDetail['milestones'][number];
type Dialog =
  | { kind: 'status'; to: InitiativeStatus }
  | { kind: 'override' }
  | { kind: 'clear-override' }
  | { kind: 'edit-details' }
  | { kind: 'edit-objectives' }
  | { kind: 'milestone'; milestone?: Milestone }
  | { kind: 'remove-milestone'; milestone: Milestone }
  | null;

/** One initiative in full: status and why, delivery, risks, dependencies, history. */
export function InitiativePage() {
  const { id } = route.useParams();
  const initiative = useApiQuery('getInitiative', { params: { id } });

  if (initiative.isPending) return <DetailSkeleton />;
  if (initiative.isError) {
    return (
      <div className="flex flex-col gap-6">
        <Link
          to="/initiatives"
          className="text-sm text-primary underline underline-offset-4"
        >
          Back to the register
        </Link>
        <Card>
          {initiative.error.status === 404 ? (
            <EmptyState
              title="This initiative cannot be shown"
              description="It may have been removed, or it is restricted and you do not have access."
            />
          ) : (
            <ErrorState
              error={initiative.error}
              onRetry={() => void initiative.refetch()}
              title="This initiative could not be loaded"
            />
          )}
        </Card>
      </div>
    );
  }
  return <Detail initiative={initiative.data} />;
}

function Detail({ initiative }: { initiative: InitiativeDetail }) {
  const session = useSession();
  const timeZone = session.organisation.timezone;
  const currency = session.organisation.currency;
  const { tab = 'overview' } = route.useSearch();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const milestoneActions = {
    onEdit: (milestone: Milestone) =>
      setDialog({ kind: 'milestone', milestone }),
    onRemove: (milestone: Milestone) =>
      setDialog({ kind: 'remove-milestone', milestone }),
  };

  useEffect(() => {
    document.title = `${initiative.code} · ${initiative.title} · SIMS`;
  }, [initiative.code, initiative.title]);

  return (
    <div className="flex flex-col gap-5">
      <InitiativeHeader
        initiative={initiative}
        onMove={(to) => setDialog({ kind: 'status', to })}
        onEdit={() => setDialog({ kind: 'edit-details' })}
        onEditObjectives={() => setDialog({ kind: 'edit-objectives' })}
      />
      <FactsStrip
        initiative={initiative}
        currency={currency}
        timeZone={timeZone}
      />
      <Notices initiative={initiative} />

      <Tabs.Root
        value={tab}
        onValueChange={(next) =>
          void navigate({
            to: '/initiatives/$id',
            params: { id: initiative.id },
            search: next === 'overview' ? {} : { tab: next as InitiativeTab },
            replace: true,
            resetScroll: false,
          })
        }
      >
        <Tabs.List
          aria-label="Initiative sections"
          className="flex gap-1 overflow-x-auto border-b border-border"
        >
          {Object.entries(INITIATIVE_TABS).map(([key, label]) => (
            <Tabs.Trigger
              key={key}
              value={key}
              className="-mb-px border-b-2 border-transparent px-3 py-2.5 text-sm whitespace-nowrap text-ink-muted transition-colors hover:text-ink data-[state=active]:border-ink data-[state=active]:font-semibold data-[state=active]:text-ink"
            >
              {label}
              {key === 'risks' &&
                initiative.risks.length > 0 &&
                ` · ${initiative.risks.length}`}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="overview" className="mt-5 outline-none">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <ExecutionCard initiative={initiative} />
                <ImpactCard initiative={initiative} />
              </div>
              {initiative.status === 'ACTIVE' && (
                <WhyThisStatus
                  initiative={initiative}
                  timeZone={timeZone}
                  onOverride={() => setDialog({ kind: 'override' })}
                  onClearOverride={() => setDialog({ kind: 'clear-override' })}
                />
              )}
              <MilestonesCard
                initiative={initiative}
                actions={milestoneActions}
                onAdd={() => setDialog({ kind: 'milestone' })}
              />
              <ProgressCard initiative={initiative} />
            </div>
            <div className="flex min-w-0 flex-col gap-5">
              <RisksCard initiative={initiative} />
              <DependenciesCard initiative={initiative} />
              <ActivityCard initiative={initiative} timeZone={timeZone} />
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="milestones" className="mt-5 outline-none">
          <Card>
            <MilestonesTable
              initiative={initiative}
              actions={milestoneActions}
            />
          </Card>
          {initiative.can.planMilestones && (
            <div className="mt-3 flex justify-end">
              <Button
                variant="secondary"
                onClick={() => setDialog({ kind: 'milestone' })}
              >
                Add milestone
              </Button>
            </div>
          )}
          <TaskBoard initiative={initiative} />
        </Tabs.Content>

        <Tabs.Content value="risks" className="mt-5 outline-none">
          <Card>
            <CardBody>
              <RiskList risks={initiative.risks} />
            </CardBody>
          </Card>
        </Tabs.Content>

        <Tabs.Content value="dependencies" className="mt-5 outline-none">
          <Card>
            <CardBody>
              <DependencyList initiative={initiative} />
            </CardBody>
          </Card>
        </Tabs.Content>

        <Tabs.Content value="changes" className="mt-5 outline-none">
          <ChangeRequests initiativeId={initiative.id} timeZone={timeZone} />
        </Tabs.Content>
      </Tabs.Root>

      {dialog?.kind === 'status' && (
        <StatusDialog
          initiative={initiative}
          to={dialog.to}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'override' && (
        <OverrideDialog
          initiative={initiative}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'clear-override' && (
        <ClearOverrideDialog
          initiative={initiative}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'edit-details' && (
        <EditDetailsDialog initiative={initiative} onClose={close} />
      )}
      {dialog?.kind === 'edit-objectives' && (
        <EditObjectivesDialog initiative={initiative} onClose={close} />
      )}
      {dialog?.kind === 'milestone' && (
        <MilestoneDialog
          initiative={initiative}
          milestone={dialog.milestone}
          onClose={close}
        />
      )}
      {dialog?.kind === 'remove-milestone' && (
        <DeleteMilestoneDialog
          initiative={initiative}
          milestone={dialog.milestone}
          onClose={close}
        />
      )}
    </div>
  );
}

/** Things that need attention, above everything else. */
function Notices({ initiative }: { initiative: InitiativeDetail }) {
  const notices: {
    tone: 'info' | 'warning' | 'danger';
    title: string;
    text?: string;
  }[] = [];
  if (initiative.health.updateOverdue) {
    notices.push({
      tone: 'danger',
      title: 'Monthly update overdue',
      text: initiative.health.updateOverdue.detail,
    });
  }
  if (initiative.status === 'PROPOSED') {
    notices.push({
      tone: 'info',
      title: 'Awaiting approval',
      text: 'The Strategy Office reviews proposals before they are planned and activated.',
    });
  }
  if (initiative.status === 'DRAFT') {
    notices.push({
      tone: 'info',
      title: 'Draft',
      text: 'Not yet submitted for approval.',
    });
  }
  if (initiative.status === 'APPROVED') {
    notices.push({
      tone: 'info',
      title: 'Approved — ready to plan',
      text: 'Add weighted milestones and baseline dates; then it can be activated.',
    });
  }
  if (initiative.status === 'ON_HOLD') {
    notices.push({
      tone: 'warning',
      title: 'On hold',
      text: 'Delivery and reporting are paused.',
    });
  }
  if (initiative.status === 'CLOSED' || initiative.status === 'CANCELLED') {
    notices.push({ tone: 'info', title: STATUS_LABELS[initiative.status] });
  }
  if (notices.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {notices.map((n) => (
        <Alert key={n.title} tone={n.tone} title={n.title}>
          {n.text}
        </Alert>
      ))}
    </div>
  );
}

const CR_TONE: Record<
  ChangeRequestView['status'],
  'info' | 'success' | 'danger' | 'neutral'
> = {
  PENDING: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
};

function ChangeRequests({
  initiativeId,
  timeZone,
}: {
  initiativeId: string;
  timeZone: string;
}) {
  const requests = useApiQuery('listChangeRequests', {
    query: { initiativeId },
  });
  return (
    <Card>
      <CardBody>
        {requests.isPending ? (
          <Skeleton className="h-24" />
        ) : requests.isError ? (
          <ErrorState
            error={requests.error}
            onRetry={() => void requests.refetch()}
          />
        ) : requests.data.length === 0 ? (
          <EmptyState
            title="No change requests"
            description="Once active, changes to the baseline dates, budget or scope go through an approved change request."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {requests.data.map((cr) => (
              <li key={cr.id} className="rounded-md border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-ink-muted">
                    {cr.reference}
                  </span>
                  <Badge tone={CR_TONE[cr.status]}>
                    {cr.status.charAt(0) + cr.status.slice(1).toLowerCase()}
                  </Badge>
                </div>
                <p className="mt-2 text-sm font-medium text-ink">
                  {cr.type
                    .replace('_CHANGE', '')
                    .replace('_', ' ')
                    .toLowerCase()
                    .replace(/^./, (c) => c.toUpperCase())}{' '}
                  change
                </p>
                {cr.justification && (
                  <p className="mt-1 text-sm text-ink">{cr.justification}</p>
                )}
                <p className="mt-2 text-xs text-ink-muted">
                  Requested by {cr.requestedBy?.name ?? 'unknown'} on{' '}
                  {formatInstantDate(cr.createdAt, timeZone)}
                  {cr.approver && ` · decided by ${cr.approver.name}`}
                  {cr.decidedAt &&
                    ` on ${formatInstantDate(cr.decidedAt, timeZone)}`}
                </p>
                {cr.decisionReason && (
                  <p className="mt-1 text-xs text-ink-muted">
                    “{cr.decisionReason}”
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <output className="sr-only">Loading the initiative…</output>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-8 w-[28rem] max-w-full" />
      <Skeleton className="h-20" />
      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}
