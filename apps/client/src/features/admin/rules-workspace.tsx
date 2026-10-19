import type { RulesetConfig, RulesetsOverview } from '@sims/contracts';
import { useState } from 'react';
import { useSession } from '@/auth/use-auth';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useApiQuery } from '@/lib/api/query';
import { formatInstantDate } from '@/lib/format';
import { CycleRules } from './cycle-rules';
import { EscalationRules } from './escalation-rules';
import { PendingProposal, ProposalPanel, RuleVersions } from './proposal-panel';
import { RagRules } from './rag-rules';
import { changed, draftErrors } from './rules-draft';

export type RulesSection = 'rules' | 'escalation' | 'cycle' | 'versions';

/**
 * The rules sections share one draft: edits in any of them build a single
 * proposal, previewed and proposed together.
 */
export function RulesWorkspace({ section }: { section: RulesSection }) {
  const rulesets = useApiQuery('getRulesets', {});
  if (rulesets.isPending) {
    return (
      <>
        <output className="sr-only">Loading the rules…</output>
        <Skeleton className="h-96" />
      </>
    );
  }
  if (rulesets.isError) {
    return (
      <Card>
        <ErrorState
          error={rulesets.error}
          onRetry={() => void rulesets.refetch()}
        />
      </Card>
    );
  }
  // A new active version (after approval) starts a fresh draft.
  return (
    <RulesEditor
      key={rulesets.data.active.id ?? 'defaults'}
      overview={rulesets.data}
      section={section}
    />
  );
}

function RulesEditor({
  overview,
  section,
}: {
  overview: RulesetsOverview;
  section: RulesSection;
}) {
  const { organisation } = useSession();
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
    <>
      <p className="flex items-center gap-2 self-start rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink">
        <span
          aria-hidden="true"
          className="size-2 rounded-full bg-success-dot"
        />
        {badge}
      </p>
      {notice && <Alert tone="success">{notice}</Alert>}
      {overview.pending && <PendingProposal pending={overview.pending} />}
      {!overview.can.propose && (
        <Alert tone="info">
          The Strategy Office proposes rule changes; you approve them in
          Decisions required on the dashboard.
        </Alert>
      )}
      {section === 'rules' && <RagRules {...props} />}
      {section === 'escalation' && <EscalationRules {...props} />}
      {section === 'cycle' && <CycleRules {...props} />}
      {section === 'versions' && <RuleVersions history={overview.history} />}
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
    </>
  );
}
