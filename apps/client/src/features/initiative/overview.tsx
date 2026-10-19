import type { InitiativeDetail } from '@sims/contracts';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Meter } from '@/components/ui/meter';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import {
  formatDate,
  formatInstantDate,
  formatInstantDay,
  formatPercent,
} from '@/lib/format';
import { HEALTH_DISPLAY } from '@/lib/health';
import { ProgressChart } from './progress-chart';

const SEVERITY_TONE = {
  CRITICAL: 'danger',
  HIGH: 'warning',
  MEDIUM: 'neutral',
  LOW: 'neutral',
} as const;

const TRAJECTORY_WORDS = {
  ON_TRAJECTORY: 'On trajectory',
  SLIGHTLY_BEHIND: 'Slightly behind',
  OFF_TRAJECTORY: 'Off trajectory',
  NOT_MEASURABLE: 'Not yet measurable',
} as const;

/** Execution against plan: verified progress, with the planned mark. */
export function ExecutionCard({
  initiative,
}: {
  initiative: InitiativeDetail;
}) {
  const { verified, planned, variancePp } = initiative.execution;
  return (
    <Card aria-labelledby="execution-title">
      <CardBody>
        <h2
          id="execution-title"
          className="text-xs font-medium tracking-wider text-ink-muted uppercase"
        >
          Execution performance
        </h2>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="tabular text-4xl font-semibold text-ink">
            {formatPercent(verified)}
          </span>
          <span className="text-sm text-ink-muted">
            vs {formatPercent(planned)} planned
          </span>
        </p>
        <Meter
          value={verified}
          marker={{ value: planned, label: 'planned' }}
          label="Verified progress"
          className="mt-3"
        />
        <p
          className={cn(
            'mt-2 text-sm',
            variancePp < -5 ? 'text-danger' : 'text-ink-muted',
          )}
        >
          {variancePp === 0
            ? 'On plan'
            : `${Math.abs(variancePp)} pp ${variancePp < 0 ? 'behind' : 'ahead of'} plan`}
        </p>
      </CardBody>
    </Card>
  );
}

/** Strategic impact: is delivery creating the promised value? */
export function ImpactCard({ initiative }: { initiative: InitiativeDetail }) {
  const { score, summary, trajectory } = initiative.impact;
  return (
    <Card aria-labelledby="impact-title">
      <CardBody>
        <h2
          id="impact-title"
          className="text-xs font-medium tracking-wider text-ink-muted uppercase"
        >
          Strategic impact
        </h2>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="tabular text-4xl font-semibold text-ink">
            {score === null ? '—' : formatPercent(score)}
          </span>
          <span className="text-sm text-ink-muted">
            {score === null ? 'not yet measurable' : 'of target'}
          </span>
        </p>
        <Meter
          value={score}
          tone="impact"
          label="Strategic impact"
          className="mt-3"
        />
        <p className="mt-2 text-sm text-impact-text">
          {summary ?? TRAJECTORY_WORDS[trajectory]}
        </p>
      </CardBody>
    </Card>
  );
}

/** "Why this status?": every rule that applied, and any manual override. */
export function WhyThisStatus({
  initiative,
  timeZone,
  onOverride,
  onClearOverride,
}: {
  initiative: InitiativeDetail;
  timeZone: string;
  onOverride: () => void;
  onClearOverride: () => void;
}) {
  const { reasons, calculated, override, updateOverdue } = initiative.health;
  return (
    <Card aria-labelledby="why-title">
      <CardHeader
        titleId="why-title"
        title="Why this status?"
        action={
          initiative.can.override && !override ? (
            <Button variant="secondary" size="sm" onClick={onOverride}>
              Override
            </Button>
          ) : undefined
        }
      />
      <CardBody className="grid gap-5 lg:grid-cols-2">
        <div>
          <p className="text-xs text-ink-muted">System-calculated</p>
          {reasons.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">No rules applied yet.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {reasons.map((reason, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Badge
                    tone={HEALTH_DISPLAY[reason.result].tone}
                    className="mt-0.5"
                  >
                    {HEALTH_DISPLAY[reason.result].label}
                  </Badge>
                  <span className="text-ink">{reason.detail}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 border-t border-border pt-2 text-sm font-semibold text-ink">
            Result: {HEALTH_DISPLAY[calculated].label}
          </p>
          {updateOverdue && (
            <p className="mt-2 text-sm text-danger">{updateOverdue.detail}</p>
          )}
        </div>
        {override && (
          <div className="rounded-md bg-surface-muted p-4">
            <p className="text-xs text-ink-muted">Management override</p>
            <p className="mt-1 font-semibold text-ink">
              Shown as {HEALTH_DISPLAY[override.health].label}
            </p>
            <blockquote className="mt-2 text-sm text-ink">
              “{override.reason}”
            </blockquote>
            <p className="mt-2 text-xs text-ink-muted">
              By {override.by?.jobTitle ?? override.by?.name ?? 'unknown'}
              {override.at && ` · ${formatInstantDay(override.at, timeZone)}`} ·
              expires {formatInstantDate(override.expiresAt, timeZone)} · logged
              in the audit trail
            </p>
            {initiative.can.override && (
              <Button
                variant="link"
                size="sm"
                className="mt-2"
                onClick={onClearOverride}
              >
                Remove override
              </Button>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** Milestones with weights and verified completion; contribution adds up to the total. */
export interface MilestoneActions {
  onEdit: (milestone: InitiativeDetail['milestones'][number]) => void;
  onRemove: (milestone: InitiativeDetail['milestones'][number]) => void;
}

export function MilestonesTable({
  initiative,
  actions,
}: {
  initiative: InitiativeDetail;
  /** Edit/remove buttons, for people who may change milestones. */
  actions?: MilestoneActions;
}) {
  const milestones = initiative.milestones;
  const canEdit = !!actions && initiative.can.manageWork;
  const canRemove = !!actions && initiative.can.planMilestones;
  if (milestones.length === 0) {
    return (
      <EmptyState
        title="No milestones yet"
        description="Milestones and their weights are set before the initiative is activated."
      />
    );
  }
  const th = 'px-3 py-2.5 text-left text-xs font-medium text-ink-muted';
  const totalWeight = milestones.reduce((s, m) => s + m.weight, 0);
  const totalContribution = milestones.reduce((s, m) => s + m.contribution, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] text-sm">
        <caption className="sr-only">
          Milestones with weight, baseline and forecast dates, verified
          completion and contribution
        </caption>
        <thead className="bg-surface-muted">
          <tr>
            <th scope="col" className={cn(th, 'pl-5')}>
              Milestone
            </th>
            <th scope="col" className={th}>
              Weight
            </th>
            <th scope="col" className={th}>
              Baseline
            </th>
            <th scope="col" className={th}>
              Forecast / actual
            </th>
            <th scope="col" className={cn(th, 'w-40')}>
              Verified
            </th>
            <th scope="col" className={th}>
              Contribution
            </th>
            <th scope="col" className={cn(th, !canEdit && 'pr-5')}>
              Evidence
            </th>
            {canEdit && (
              <th scope="col" className={cn(th, 'pr-5')}>
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {milestones.map((m) => {
            const late = m.forecastDate && m.forecastDate > m.baselineDate;
            return (
              <tr key={m.id}>
                <th
                  scope="row"
                  className="px-3 py-3 pl-5 text-left font-normal"
                >
                  <span className="block font-medium text-ink">{m.title}</span>
                  <span
                    className={cn(
                      'block text-xs',
                      m.overdueDays > 0 ? 'text-danger' : 'text-ink-muted',
                    )}
                  >
                    {m.isCritical && 'Critical · '}
                    {m.overdueDays > 0
                      ? `${m.overdueDays} days overdue`
                      : m.status
                          .replace('_', ' ')
                          .toLowerCase()
                          .replace(/^./, (c) => c.toUpperCase())}
                  </span>
                </th>
                <td className="tabular px-3 py-3">{formatPercent(m.weight)}</td>
                <td className="tabular px-3 py-3 whitespace-nowrap">
                  {formatDate(m.baselineDate)}
                </td>
                <td
                  className={cn(
                    'tabular px-3 py-3 whitespace-nowrap',
                    late && 'text-danger',
                  )}
                >
                  {m.actualDate
                    ? formatDate(m.actualDate)
                    : m.forecastDate
                      ? `${formatDate(m.forecastDate)} (forecast)`
                      : formatDate(m.baselineDate)}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <Meter
                      value={m.verifiedCompletion}
                      label={`Verified completion, ${m.title}`}
                      className="flex-1"
                    />
                    <span className="tabular w-10 text-right">
                      {formatPercent(m.verifiedCompletion)}
                    </span>
                  </div>
                </td>
                <td className="tabular px-3 py-3 font-semibold">
                  {formatPercent(m.contribution)}
                </td>
                <td className="px-3 py-3 pr-5 text-xs text-ink-muted">
                  {m.evidenceCount > 0
                    ? `${m.evidenceCount} file${m.evidenceCount === 1 ? '' : 's'}`
                    : '—'}
                </td>
                {canEdit && (
                  <td className="px-3 py-3 pr-5 whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => actions.onEdit(m)}
                      aria-label={`Edit ${m.title}`}
                    >
                      Edit
                    </Button>
                    {canRemove && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger"
                        onClick={() => actions.onRemove(m)}
                        aria-label={`Remove ${m.title}`}
                      >
                        Remove
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-ink">
          <tr>
            <th
              scope="row"
              className="px-3 py-2.5 pl-5 text-left font-semibold"
            >
              Total
            </th>
            <td className="tabular px-3 py-2.5 font-semibold">
              {formatPercent(totalWeight)}
            </td>
            <td colSpan={3}>
              <span className="sr-only">No total</span>
            </td>
            <td className="tabular px-3 py-2.5 font-semibold">
              {formatPercent(totalContribution)}
            </td>
            <td colSpan={canEdit ? 2 : 1}>
              <span className="sr-only">No total</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function MilestonesCard({
  initiative,
  actions,
  onAdd,
}: {
  initiative: InitiativeDetail;
  actions?: MilestoneActions;
  onAdd?: () => void;
}) {
  return (
    <Card aria-labelledby="milestones-title">
      <CardHeader
        titleId="milestones-title"
        title="Milestones"
        description="Completion = Σ(weight × verified completion) ÷ Σ weight"
        action={
          onAdd && initiative.can.planMilestones ? (
            <Button variant="secondary" size="sm" onClick={onAdd}>
              Add milestone
            </Button>
          ) : undefined
        }
      />
      <div className="mt-4 border-t border-border">
        <MilestonesTable initiative={initiative} actions={actions} />
      </div>
    </Card>
  );
}

export function ProgressCard({ initiative }: { initiative: InitiativeDetail }) {
  return (
    <Card aria-labelledby="progress-title">
      <CardHeader titleId="progress-title" title="Planned vs actual progress" />
      <CardBody>
        <ProgressChart history={initiative.progressHistory} />
      </CardBody>
    </Card>
  );
}

export function RiskList({
  risks,
  limit,
}: {
  risks: InitiativeDetail['risks'];
  limit?: number;
}) {
  const shown = limit ? risks.slice(0, limit) : risks;
  if (risks.length === 0)
    return <EmptyState className="py-6" title="No open risks or issues" />;
  return (
    <ul className="flex flex-col gap-2">
      {shown.map((risk) => (
        <li key={risk.id} className="rounded-md border border-border p-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <Badge tone={SEVERITY_TONE[risk.severity]}>
              {risk.severity.charAt(0) + risk.severity.slice(1).toLowerCase()}
            </Badge>
            <span className="text-ink-muted">
              {risk.type === 'ISSUE' ? 'Issue' : 'Risk'}
            </span>
          </div>
          <p className="mt-2 text-sm text-ink">{risk.title}</p>
          <p className="mt-1 text-xs text-ink-muted">
            Owner: {risk.owner?.jobTitle ?? risk.owner?.name ?? 'Not assigned'}
            {risk.escalationLevel && ` · escalated L${risk.escalationLevel}`}
            {risk.dueDate && ` · due ${formatDate(risk.dueDate)}`}
            {risk.status === 'MITIGATED' && ' · mitigation in place'}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function RisksCard({ initiative }: { initiative: InitiativeDetail }) {
  return (
    <Card aria-labelledby="risks-title">
      <CardHeader
        titleId="risks-title"
        title="Risks & issues"
        action={
          <span className="text-ink-muted">{initiative.risks.length} open</span>
        }
      />
      <CardBody className="pt-3">
        <RiskList risks={initiative.risks} limit={3} />
      </CardBody>
    </Card>
  );
}

export function DependencyList({
  initiative,
}: {
  initiative: InitiativeDetail;
}) {
  const { blockedBy, enables } = initiative.dependencies;
  if (blockedBy.length + enables.length === 0) {
    return <EmptyState className="py-6" title="No dependencies" />;
  }
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {blockedBy.map((d) => (
        <li
          key={`b-${d.initiativeId}`}
          className={cn(
            'rounded-md px-3 py-2',
            d.status === 'BLOCKED' ? 'bg-danger-soft' : 'bg-surface-muted',
          )}
        >
          <span
            className={cn(
              'mr-2 text-xs font-medium',
              d.status === 'BLOCKED' ? 'text-danger' : 'text-ink-muted',
            )}
          >
            {d.status === 'BLOCKED' ? 'Blocked by' : 'Depends on'}
          </span>
          <Link
            to="/initiatives/$id"
            params={{ id: d.initiativeId }}
            className="text-ink hover:underline"
          >
            <span className="font-mono text-xs">{d.code}</span> {d.title}
          </Link>
          {d.isCriticalPath && (
            <span className="ml-2 text-xs text-ink-muted">critical path</span>
          )}
          {d.blockedSince && (
            <span className="block text-xs text-danger">
              Blocked since {formatDate(d.blockedSince)}
            </span>
          )}
        </li>
      ))}
      {enables.map((d) => (
        <li
          key={`e-${d.initiativeId}`}
          className="rounded-md bg-surface-muted px-3 py-2"
        >
          <span className="mr-2 text-xs font-medium text-ink-muted">
            Enables
          </span>
          <Link
            to="/initiatives/$id"
            params={{ id: d.initiativeId }}
            className="text-ink hover:underline"
          >
            <span className="font-mono text-xs">{d.code}</span> {d.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function DependenciesCard({
  initiative,
}: {
  initiative: InitiativeDetail;
}) {
  return (
    <Card aria-labelledby="dependencies-title">
      <CardHeader titleId="dependencies-title" title="Dependencies" />
      <CardBody className="pt-3">
        <DependencyList initiative={initiative} />
      </CardBody>
    </Card>
  );
}

export function ActivityCard({
  initiative,
  timeZone,
}: {
  initiative: InitiativeDetail;
  timeZone: string;
}) {
  return (
    <Card aria-labelledby="activity-title">
      <CardHeader titleId="activity-title" title="Activity & audit trail" />
      <CardBody className="pt-3">
        {initiative.activity.length === 0 ? (
          <EmptyState className="py-6" title="Nothing recorded yet" />
        ) : (
          <ol className="flex flex-col divide-y divide-border">
            {initiative.activity.map((event, i) => (
              <li key={i} className="flex gap-3 py-2.5 first:pt-0">
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-subtle"
                />
                <div className="min-w-0 text-sm">
                  <p className="text-ink">{event.summary}</p>
                  <p className="text-xs text-ink-muted">
                    <time dateTime={event.at}>
                      {formatInstantDay(event.at, timeZone)}
                    </time>
                    {event.actor &&
                      ` · ${event.actor.jobTitle ?? event.actor.name}`}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
