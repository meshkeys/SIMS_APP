import { type Role, ROLE_LABELS } from '@sims/contracts';
import { useId } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { NumberSetting, RuleToggle } from './rule-fields';
import type { RulesSectionProps } from './rules-draft';

/** Roles that may be trusted with manual overrides, lowest first. */
const OVERRIDE_ROLES: Role[] = [
  'INITIATIVE_OWNER',
  'EXECUTIVE_SPONSOR',
  'STRATEGY_OFFICE',
  'CEO',
];

/** RAG thresholds, health modifiers, overrides, and impact and KPI thresholds. */
export function RagRules({
  draft,
  live,
  onChange,
  errors,
  editable,
}: RulesSectionProps) {
  const { rag } = draft;
  const scale = Math.max(30, rag.amberMaxPpBehind + 5);
  const pct = (pp: number) => `${Math.min(100, (pp / scale) * 100)}%`;
  const modifiers = draft.healthModifiers;

  return (
    <div className="flex flex-col gap-6">
      <Card aria-labelledby="rag-title">
        <CardHeader
          titleId="rag-title"
          title="RAG thresholds"
          description="Based on percentage points (pp) behind planned completion."
        />
        <CardBody className="flex flex-col gap-5">
          <div aria-hidden="true">
            <div className="flex h-7 overflow-hidden rounded-md text-xs font-medium">
              <div
                className="flex items-center bg-success-soft px-2 text-success"
                style={{ width: pct(rag.greenMaxPpBehind) }}
              >
                Green
              </div>
              <div
                className="flex items-center bg-warning-soft px-2 text-warning"
                style={{
                  width: pct(rag.amberMaxPpBehind - rag.greenMaxPpBehind),
                }}
              >
                Amber
              </div>
              <div className="flex flex-1 items-center bg-danger-soft px-2 text-danger">
                Red
              </div>
            </div>
            <div className="mt-1 flex justify-between text-xs text-ink-subtle">
              <span>0 pp</span>
              <span>{Math.round(scale / 3)}</span>
              <span>{Math.round((scale * 2) / 3)}</span>
              <span>{scale} pp behind</span>
            </div>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <Threshold
              label="Green up to"
              value={rag.greenMaxPpBehind}
              liveValue={live.rag.greenMaxPpBehind}
              tone="accent-success-dot"
              disabled={!editable}
              error={errors.get('rag.greenMaxPpBehind')}
              onChange={(v) => onChange((c) => (c.rag.greenMaxPpBehind = v))}
            />
            <Threshold
              label="Amber up to"
              value={rag.amberMaxPpBehind}
              liveValue={live.rag.amberMaxPpBehind}
              tone="accent-warning-dot"
              disabled={!editable}
              error={errors.get('rag.amberMaxPpBehind')}
              note="Anything beyond is Red."
              onChange={(v) => onChange((c) => (c.rag.amberMaxPpBehind = v))}
            />
          </div>
        </CardBody>
      </Card>

      <Card aria-labelledby="modifiers-title">
        <CardHeader
          titleId="modifiers-title"
          title="Health overrides & modifiers"
        />
        <CardBody>
          <ul className="flex flex-col divide-y divide-border">
            <RuleToggle
              title="An overdue critical milestone forces Red"
              description="Regardless of overall progress"
              checked={modifiers.overdueCriticalMilestoneForcesRed}
              disabled={!editable}
              onChange={(v) =>
                onChange(
                  (c) =>
                    (c.healthModifiers.overdueCriticalMilestoneForcesRed = v),
                )
              }
            />
            <RuleToggle
              title="An open critical issue caps health at Amber"
              description="A project ahead of schedule with a regulatory blocker cannot show Green"
              checked={modifiers.openCriticalIssueCapsAtAmber}
              disabled={!editable}
              onChange={(v) =>
                onChange(
                  (c) => (c.healthModifiers.openCriticalIssueCapsAtAmber = v),
                )
              }
            />
            <RuleToggle
              title={`A blocked dependency older than ${modifiers.blockedDependencyCapsAtAmber.minDaysBlocked} days caps health at Amber`}
              description={
                modifiers.blockedDependencyCapsAtAmber.criticalPathOnly
                  ? 'Applies to dependencies on the critical path'
                  : 'Applies to every dependency'
              }
              checked={modifiers.blockedDependencyCapsAtAmber.enabled}
              disabled={!editable}
              onChange={(v) =>
                onChange(
                  (c) =>
                    (c.healthModifiers.blockedDependencyCapsAtAmber.enabled =
                      v),
                )
              }
            >
              {modifiers.blockedDependencyCapsAtAmber.enabled && (
                <div className="flex flex-wrap items-end gap-6">
                  <NumberSetting
                    label="Blocked for at least"
                    unit="days"
                    min={1}
                    value={
                      modifiers.blockedDependencyCapsAtAmber.minDaysBlocked
                    }
                    disabled={!editable}
                    error={errors.get(
                      'healthModifiers.blockedDependencyCapsAtAmber.minDaysBlocked',
                    )}
                    onChange={(v) =>
                      onChange(
                        (c) =>
                          (c.healthModifiers.blockedDependencyCapsAtAmber.minDaysBlocked =
                            v),
                      )
                    }
                  />
                  <label className="flex items-center gap-2 pb-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={
                        modifiers.blockedDependencyCapsAtAmber.criticalPathOnly
                      }
                      disabled={!editable}
                      onChange={(e) =>
                        onChange(
                          (c) =>
                            (c.healthModifiers.blockedDependencyCapsAtAmber.criticalPathOnly =
                              e.target.checked),
                        )
                      }
                    />
                    Critical path only
                  </label>
                </div>
              )}
            </RuleToggle>
            <RuleToggle
              title='A missed update makes health "Unknown" instead of keeping the old status'
              description="Stops stale Green statuses carrying into the Board pack"
              checked={modifiers.missedUpdateMakesUnknown}
              disabled={!editable}
              onChange={(v) =>
                onChange(
                  (c) => (c.healthModifiers.missedUpdateMakesUnknown = v),
                )
              }
            />
          </ul>
          <div className="mt-4 flex flex-wrap items-end gap-6 border-t border-border pt-4">
            <NumberSetting
              label="Manual overrides expire after"
              unit="days"
              min={1}
              value={draft.overrides.expiryDays}
              disabled={!editable}
              error={errors.get('overrides.expiryDays')}
              onChange={(v) => onChange((c) => (c.overrides.expiryDays = v))}
            />
            <OverrideRole
              value={draft.overrides.minimumRole}
              disabled={!editable}
              onChange={(role) =>
                onChange((c) => (c.overrides.minimumRole = role))
              }
            />
          </div>
        </CardBody>
      </Card>

      <Card aria-labelledby="impact-rules-title">
        <CardHeader
          titleId="impact-rules-title"
          title="Impact & KPI thresholds"
          description="How delivered value and KPI trajectories are judged."
        />
        <CardBody className="grid gap-6 sm:grid-cols-3">
          <NumberSetting
            label="Delivered but low value below"
            unit="% of target"
            min={1}
            max={100}
            value={draft.impact.lowValueThresholdPct}
            disabled={!editable}
            error={errors.get('impact.lowValueThresholdPct')}
            onChange={(v) =>
              onChange((c) => (c.impact.lowValueThresholdPct = v))
            }
          />
          <NumberSetting
            label="KPI on trajectory from"
            unit="% of the way"
            min={1}
            max={100}
            value={draft.impact.onTrajectoryMinPct}
            disabled={!editable}
            error={errors.get('impact.onTrajectoryMinPct')}
            onChange={(v) => onChange((c) => (c.impact.onTrajectoryMinPct = v))}
          />
          <NumberSetting
            label="KPI slightly behind from"
            unit="% of the way"
            min={0}
            max={100}
            value={draft.impact.slightlyBehindMinPct}
            disabled={!editable}
            error={errors.get('impact.slightlyBehindMinPct')}
            onChange={(v) =>
              onChange((c) => (c.impact.slightlyBehindMinPct = v))
            }
          />
        </CardBody>
      </Card>
    </div>
  );
}

function Threshold({
  label,
  value,
  liveValue,
  tone,
  disabled,
  error,
  note,
  onChange,
}: {
  label: string;
  value: number;
  liveValue: number;
  tone: string;
  disabled: boolean;
  error?: string;
  note?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="flex justify-between text-sm font-medium text-ink"
      >
        {label}
        <output htmlFor={id} className="tabular">
          {value} pp
        </output>
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={50}
        step={1}
        value={value}
        disabled={disabled}
        className={`w-full ${tone}`}
        aria-describedby={`${id}-note`}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <p id={`${id}-note`} className="text-xs text-ink-muted">
        Current live value: {liveValue} pp.{note ? ` ${note}` : ''}
      </p>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function OverrideRole({
  value,
  disabled,
  onChange,
}: {
  value: Role;
  disabled: boolean;
  onChange: (role: Role) => void;
}) {
  const id = useId();
  const options = OVERRIDE_ROLES.includes(value)
    ? OVERRIDE_ROLES
    : [...OVERRIDE_ROLES, value];
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        Who can override
      </label>
      <Select
        id={id}
        className="w-auto min-w-56"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Role)}
      >
        {options.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABELS[role]} or above
          </option>
        ))}
      </Select>
    </div>
  );
}
