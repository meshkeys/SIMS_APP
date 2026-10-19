import type { RulesetConfig, RulesetsOverview } from '@sims/contracts';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useSession } from '@/auth/use-auth';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useApiQuery } from '@/lib/api/query';
import { cn } from '@/lib/cn';
import { formatInstantDate } from '@/lib/format';
import { CycleRules } from './cycle-rules';
import { EscalationRules } from './escalation-rules';
import { PendingProposal, ProposalPanel, RuleVersions } from './proposal-panel';
import { RagRules } from './rag-rules';
import { changed, draftErrors } from './rules-draft';

const route = getRouteApi('/app/admin');

const ADMIN_SECTIONS = {
  rules: { label: 'RAG & health rules', note: 'Thresholds and overrides' },
  escalation: { label: 'Escalation rules', note: 'Ladder and timings' },
  cycle: { label: 'Reporting cycles', note: 'Cadence, windows, reminders' },
  versions: { label: 'Rule versions', note: 'Every change, read-only' },
} as const;
type AdminSection = keyof typeof ADMIN_SECTIONS;

const HEADER = {
  eyebrow: 'Administration · Governance & configuration',
  title: 'Administration',
  description:
    'Rule changes follow maker-checker: proposed here, approved by the MD/CEO, logged in full.',
};

/** Governance configuration: the organisation's rules, edited as one proposal. */
export function AdminPage() {
  const rulesets = useApiQuery('getRulesets', {});
  if (rulesets.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader {...HEADER} />
        <output className="sr-only">Loading the rules…</output>
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (rulesets.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader {...HEADER} />
        <Card>
          <ErrorState
            error={rulesets.error}
            onRetry={() => void rulesets.refetch()}
          />
        </Card>
      </div>
    );
  }
  // A new active version (after approval) starts a fresh draft.
  return (
    <RulesEditor
      key={rulesets.data.active.id ?? 'defaults'}
      overview={rulesets.data}
    />
  );
}

function RulesEditor({ overview }: { overview: RulesetsOverview }) {
  const { organisation } = useSession();
  const { section = 'rules' } = route.useSearch();
  const live = overview.active.config;
  const [draft, setDraft] = useState<RulesetConfig>(() =>
    structuredClone(live),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const errors = draftErrors(draft);
  const editable = overview.can.propose && !overview.pending;
  const props = {
    draft,
    live,
    errors,
    editable,
    onChange: (change: (copy: RulesetConfig) => void) => {
      setNotice(null);
      setDraft((d) => changed(d, change));
    },
  };

  const active = overview.active;
  const badge = active.version
    ? `Ruleset v${active.version}${
        active.effectiveFrom
          ? ` · approved ${formatInstantDate(active.effectiveFrom, organisation.timezone)}`
          : ''
      }`
    : 'Default rules';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        {...HEADER}
        actions={
          <p className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink">
            <span
              aria-hidden="true"
              className="size-2 rounded-full bg-success-dot"
            />
            {badge}
          </p>
        }
      />
      {notice && <Alert tone="success">{notice}</Alert>}
      {overview.pending && <PendingProposal pending={overview.pending} />}
      {!overview.can.propose && (
        <Alert tone="info">
          The Strategy Office proposes rule changes; you approve them in
          Decisions required on the dashboard.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Administration sections">
          <Card>
            <ul className="flex flex-col gap-1 p-2">
              {(Object.keys(ADMIN_SECTIONS) as AdminSection[]).map((key) => (
                <li key={key}>
                  <Link
                    to="/admin"
                    search={{ section: key }}
                    aria-current={key === section ? 'page' : undefined}
                    className={cn(
                      'block rounded-md px-3 py-2',
                      key === section
                        ? 'bg-primary-soft'
                        : 'hover:bg-surface-muted',
                    )}
                  >
                    <span className="block text-sm font-medium text-ink">
                      {ADMIN_SECTIONS[key].label}
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {ADMIN_SECTIONS[key].note}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          {section === 'rules' && <RagRules {...props} />}
          {section === 'escalation' && <EscalationRules {...props} />}
          {section === 'cycle' && <CycleRules {...props} />}
          {section === 'versions' && (
            <RuleVersions history={overview.history} />
          )}
          {editable && (
            <ProposalPanel
              live={live}
              draft={draft}
              valid={errors.size === 0}
              onDiscard={() => setDraft(structuredClone(live))}
              onProposed={(view) =>
                setNotice(
                  `Version ${view.version} was sent to the MD/CEO for approval. It takes effect once approved.`,
                )
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
