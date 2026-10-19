import {
  type EscalationLevelConfig,
  MAX_ESCALATION_LEVELS,
  type Role,
  ROLE_LABELS,
} from '@sims/contracts';
import { Plus, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form';
import { NumberInput } from './rule-fields';
import type { RulesSectionProps } from './rules-draft';

type DecidedBy = EscalationLevelConfig['decidedBy'];

/** "OWNER", "SPONSOR" or a role, as one select value. */
const toChoice = (d: DecidedBy) =>
  d.type === 'ROLE'
    ? d.role
    : d.type === 'INITIATIVE_OWNER'
      ? 'OWNER'
      : 'SPONSOR';
const fromChoice = (value: string): DecidedBy =>
  value === 'OWNER'
    ? { type: 'INITIATIVE_OWNER' }
    : value === 'SPONSOR'
      ? { type: 'INITIATIVE_SPONSOR' }
      : { type: 'ROLE', role: value as Role };

/** The escalation ladder: levels, who decides at each, and when items arrive. */
export function EscalationRules({
  draft,
  onChange,
  errors,
  editable,
}: RulesSectionProps) {
  const { levels, criticalStartsAtLevel } = draft.escalation;
  const criticalId = useId();
  const levelError = (i: number, field: string) =>
    errors.get(`escalation.levels.${i}.${field}`);

  return (
    <Card aria-labelledby="ladder-rules-title">
      <CardHeader
        titleId="ladder-rules-title"
        title="Escalation ladder"
        description="Unresolved items move up automatically after each level's days. Levels reached by decision only stop the climb."
      />
      <CardBody className="flex flex-col gap-4">
        <ol className="flex flex-col gap-3">
          {levels.map((level, i) => (
            <li
              key={level.level}
              className="rounded-md border border-border p-3"
            >
              <fieldset className="m-0 border-0 p-0">
                <legend className="sr-only">Level {level.level}</legend>
                <div className="grid gap-3 md:grid-cols-[3rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <p
                    className="pt-2 text-sm font-semibold text-ink"
                    aria-hidden="true"
                  >
                    L{level.level}
                  </p>
                  <div className="flex flex-col gap-2">
                    <Input
                      aria-label={`Level ${level.level} name`}
                      value={level.name}
                      disabled={!editable}
                      aria-invalid={levelError(i, 'name') ? true : undefined}
                      onChange={(e) =>
                        onChange(
                          (c) =>
                            (c.escalation.levels[i]!.name = e.target.value),
                        )
                      }
                    />
                    <Input
                      aria-label={`Level ${level.level} description`}
                      placeholder="e.g. Resolve within 7 days"
                      value={level.description ?? ''}
                      disabled={!editable}
                      onChange={(e) =>
                        onChange(
                          (c) =>
                            (c.escalation.levels[i]!.description =
                              e.target.value || undefined),
                        )
                      }
                    />
                    {levelError(i, 'name') && (
                      <p className="text-xs text-danger">
                        {levelError(i, 'name')}
                      </p>
                    )}
                  </div>
                  <Select
                    aria-label={`Level ${level.level} decided by`}
                    value={toChoice(level.decidedBy)}
                    disabled={!editable}
                    onChange={(e) =>
                      onChange(
                        (c) =>
                          (c.escalation.levels[i]!.decidedBy = fromChoice(
                            e.target.value,
                          )),
                      )
                    }
                  >
                    <option value="OWNER">Initiative owner</option>
                    <option value="SPONSOR">Initiative sponsor</option>
                    {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </Select>
                  <div className="flex flex-col gap-1 text-sm">
                    {i === 0 ? (
                      <p className="pt-2 text-ink-muted">When raised</p>
                    ) : (
                      <>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="size-4 accent-primary"
                            checked={level.autoEscalateAfterDays === null}
                            disabled={!editable}
                            onChange={(e) =>
                              onChange(
                                (c) =>
                                  (c.escalation.levels[
                                    i
                                  ]!.autoEscalateAfterDays = e.target.checked
                                    ? null
                                    : (levels[i - 1]?.autoEscalateAfterDays ??
                                        0) + 7),
                              )
                            }
                          />
                          By decision only
                        </label>
                        {level.autoEscalateAfterDays !== null && (
                          <span className="flex items-center gap-2">
                            After
                            <NumberInput
                              min={1}
                              max={365}
                              className="h-9 w-20"
                              aria-label={`Level ${level.level} arrives after days`}
                              value={level.autoEscalateAfterDays}
                              disabled={!editable}
                              aria-invalid={
                                levelError(i, 'autoEscalateAfterDays')
                                  ? true
                                  : undefined
                              }
                              onValue={(n) =>
                                onChange(
                                  (c) =>
                                    (c.escalation.levels[
                                      i
                                    ]!.autoEscalateAfterDays = n),
                                )
                              }
                            />
                            days
                          </span>
                        )}
                        {levelError(i, 'autoEscalateAfterDays') && (
                          <p className="text-xs text-danger">
                            {levelError(i, 'autoEscalateAfterDays')}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </fieldset>
            </li>
          ))}
        </ol>

        {editable && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={levels.length >= MAX_ESCALATION_LEVELS}
              onClick={() =>
                onChange((c) =>
                  c.escalation.levels.push({
                    level: levels.length + 1,
                    name: 'New level',
                    decidedBy: { type: 'ROLE', role: 'BOARD' },
                    autoEscalateAfterDays: null,
                  }),
                )
              }
            >
              <Plus />
              Add a level
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={levels.length <= 1}
              onClick={() =>
                onChange((c) => {
                  c.escalation.levels.pop();
                  if (
                    (c.escalation.criticalStartsAtLevel ?? 0) >
                    c.escalation.levels.length
                  )
                    c.escalation.criticalStartsAtLevel =
                      c.escalation.levels.length;
                })
              }
            >
              <Trash2 />
              Remove L{levels.length}
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <label htmlFor={criticalId} className="text-sm font-medium text-ink">
            Critical items start at
          </label>
          <Select
            id={criticalId}
            className="w-auto min-w-64"
            value={criticalStartsAtLevel ?? ''}
            disabled={!editable}
            onChange={(e) =>
              onChange(
                (c) =>
                  (c.escalation.criticalStartsAtLevel = e.target.value
                    ? Number(e.target.value)
                    : null),
              )
            }
          >
            <option value="">L1, like everything else</option>
            {levels.slice(1).map((l) => (
              <option key={l.level} value={l.level}>
                L{l.level} · {l.name}
              </option>
            ))}
          </Select>
          {errors.get('escalation.criticalStartsAtLevel') && (
            <p className="text-xs text-danger">
              {errors.get('escalation.criticalStartsAtLevel')}
            </p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
