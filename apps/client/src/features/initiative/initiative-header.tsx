import type { InitiativeDetail, InitiativeStatus } from '@sims/contracts';
import { Link } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { HEALTH_DISPLAY } from '@/lib/health';
import {
  formatDate,
  formatInstantDate,
  formatMoney,
  formatPercent,
} from '@/lib/format';
import { cn } from '@/lib/cn';
import { moveLabel, STATUS_LABELS } from './labels';

export function InitiativeHeader({
  initiative,
  onMove,
}: {
  initiative: InitiativeDetail;
  onMove: (to: InitiativeStatus) => void;
}) {
  const health = initiative.health;
  const shown = HEALTH_DISPLAY[health.effective];
  const primary = initiative.contributesTo.filter((c) => c.isPrimary);
  const others = initiative.contributesTo.filter((c) => !c.isPrimary);

  return (
    <header className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
        <ol className="flex gap-1.5">
          <li>
            <Link
              to="/initiatives"
              className="text-primary underline underline-offset-4"
            >
              Initiatives
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-mono">
            {initiative.code}
          </li>
        </ol>
      </nav>

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-[1.75rem]">
            {initiative.title}
          </h1>
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Summary">
            {initiative.status === 'ACTIVE' ? (
              <li>
                <Badge tone={shown.tone} dot>
                  {shown.label}
                  {health.override && ' · overridden'}
                </Badge>
              </li>
            ) : (
              <li>
                <Badge tone="info">{STATUS_LABELS[initiative.status]}</Badge>
              </li>
            )}
            <li>
              <Badge>Priority {initiative.priority}</Badge>
            </li>
            {initiative.pillar && (
              <li>
                <Badge>{initiative.pillar.title}</Badge>
              </li>
            )}
            {initiative.contributesTo.length > 0 && (
              <li>
                <Badge>
                  Contributes to{' '}
                  {[...primary, ...others].map((c) => c.code).join(' · ')}
                </Badge>
              </li>
            )}
            {initiative.isSensitive && (
              <li>
                <Badge tone="warning">Restricted</Badge>
              </li>
            )}
          </ul>
        </div>

        {initiative.can.changeStatus.length > 0 && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="secondary">
                Change status
                <ChevronDown aria-hidden="true" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="z-50 min-w-52 rounded-md border border-border bg-surface p-1 text-sm shadow-lg"
              >
                {initiative.can.changeStatus.map((to) => (
                  <DropdownMenu.Item
                    key={to}
                    onSelect={() => onMove(to)}
                    className={cn(
                      'cursor-pointer rounded px-3 py-2 outline-none select-none data-[highlighted]:bg-neutral-soft',
                      to === 'CANCELLED' ? 'text-danger' : 'text-ink',
                    )}
                  >
                    {moveLabel(initiative.status, to)}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>
    </header>
  );
}

/** Owner, sponsor, benefits owner, baseline, budget, last verified update. */
export function FactsStrip({
  initiative,
  currency,
  timeZone,
}: {
  initiative: InitiativeDetail;
  currency: string;
  timeZone: string;
}) {
  const person = (p: InitiativeDetail['owner']) =>
    p ? (p.jobTitle ?? p.name) : 'Not assigned';
  const { start, end } = initiative.baseline;
  const budget = initiative.budget;
  const facts = [
    {
      label: 'Initiative owner',
      value: person(initiative.owner),
      title: initiative.owner?.name,
    },
    {
      label: 'Executive sponsor',
      value: person(initiative.sponsor),
      title: initiative.sponsor?.name,
    },
    {
      label: 'Benefits owner',
      value: person(initiative.benefitsOwner),
      title: initiative.benefitsOwner?.name,
    },
    {
      label: 'Baseline dates',
      value:
        start && end ? `${formatDate(start)} – ${formatDate(end)}` : 'Not set',
    },
    {
      label: 'Budget',
      value:
        budget.baseline === null
          ? 'Not set'
          : `${formatMoney(budget.baseline, currency)}${
              budget.spentPct === null
                ? ''
                : ` · ${formatPercent(budget.spentPct)} spent`
            }`,
    },
    {
      label: 'Last verified update',
      value: initiative.lastVerifiedUpdateAt
        ? formatInstantDate(initiative.lastVerifiedUpdateAt, timeZone)
        : 'None yet',
    },
  ];
  return (
    <Card>
      <dl className="grid grid-cols-2 divide-border sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
        {facts.map((fact) => (
          <div key={fact.label} className="px-4 py-3">
            <dt className="text-xs text-ink-muted">{fact.label}</dt>
            <dd
              className="mt-0.5 text-sm font-medium text-ink"
              title={fact.title}
            >
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
      {initiative.forecastEnd && end && initiative.forecastEnd > end && (
        <p className="border-t border-border px-4 py-2 text-xs text-danger">
          Forecast to finish {formatDate(initiative.forecastEnd)}, after the
          baseline end date.
        </p>
      )}
    </Card>
  );
}
