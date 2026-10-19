import type { RulesetConfig } from '@sims/contracts';
import { useId } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { NumberSetting } from './rule-fields';
import type { RulesSectionProps } from './rules-draft';

type Stage = 'ownerSubmission' | 'strategyReview' | 'sponsorReview';

const STAGES: { key: Stage; title: string; description: string }[] = [
  {
    key: 'ownerSubmission',
    title: 'Owner submission',
    description: 'Owners submit their monthly updates',
  },
  {
    key: 'strategyReview',
    title: 'Strategy Office review',
    description: 'The Strategy Office verifies or challenges',
  },
  {
    key: 'sponsorReview',
    title: 'Sponsor review',
    description: 'Sponsors confirm the verified status',
  },
];

const REMINDER_DAYS = [5, 3, 2, 1, 0];

/** The reporting cycle: cadence, stage windows, report day and reminders. */
export function CycleRules({
  draft,
  onChange,
  errors,
  editable,
}: RulesSectionProps) {
  const cycle = draft.reportingCycle;
  const cadenceId = useId();
  const error = (path: string) => errors.get(`reportingCycle.${path}`);

  return (
    <Card aria-labelledby="cycle-rules-title">
      <CardHeader
        titleId="cycle-rules-title"
        title="Reporting cycle"
        description="Windows are in working days from the start of each cycle. Changes apply from the next cycle opened; a cycle already open keeps its deadlines."
      />
      <CardBody className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <label htmlFor={cadenceId} className="text-sm font-medium text-ink">
            Cadence
          </label>
          <Select
            id={cadenceId}
            className="w-auto min-w-48"
            value={cycle.cadence}
            disabled={!editable}
            onChange={(e) =>
              onChange(
                (c) =>
                  (c.reportingCycle.cadence = e.target
                    .value as RulesetConfig['reportingCycle']['cadence']),
              )
            }
          >
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly</option>
          </Select>
        </div>

        <ul className="flex flex-col divide-y divide-border">
          {STAGES.map((stage) => (
            <li
              key={stage.key}
              className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
            >
              <div>
                <p className="font-medium text-ink">{stage.title}</p>
                <p className="text-sm text-ink-muted">{stage.description}</p>
              </div>
              <NumberSetting
                label="From day"
                min={1}
                max={31}
                value={cycle[stage.key].fromDay}
                disabled={!editable}
                error={error(`${stage.key}.fromDay`)}
                onChange={(v) =>
                  onChange((c) => (c.reportingCycle[stage.key].fromDay = v))
                }
              />
              <NumberSetting
                label="To day"
                min={1}
                max={31}
                value={cycle[stage.key].toDay}
                disabled={!editable}
                error={error(`${stage.key}.toDay`)}
                onChange={(v) =>
                  onChange((c) => (c.reportingCycle[stage.key].toDay = v))
                }
              />
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-8 border-t border-border pt-4">
          <NumberSetting
            label="Report issued on day"
            min={1}
            max={31}
            value={cycle.reportIssueDay}
            disabled={!editable}
            error={error('reportIssueDay')}
            onChange={(v) =>
              onChange((c) => (c.reportingCycle.reportIssueDay = v))
            }
          />
          <fieldset className="m-0 border-0 p-0">
            <legend className="text-sm font-medium text-ink">
              Reminders to owners
            </legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {REMINDER_DAYS.map((day) => (
                <label
                  key={day}
                  className="flex items-center gap-2 text-sm text-ink"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={cycle.reminderDaysBeforeDue.includes(day)}
                    disabled={!editable}
                    onChange={(e) =>
                      onChange((c) => {
                        const set = new Set(
                          c.reportingCycle.reminderDaysBeforeDue,
                        );
                        if (e.target.checked) set.add(day);
                        else set.delete(day);
                        c.reportingCycle.reminderDaysBeforeDue = [...set].sort(
                          (a, b) => b - a,
                        );
                      })
                    }
                  />
                  {day === 0
                    ? 'On the deadline day'
                    : `${day} working day${day === 1 ? '' : 's'} before`}
                </label>
              ))}
            </div>
            {error('reminderDaysBeforeDue') && (
              <p className="mt-1 text-xs text-danger">
                {error('reminderDaysBeforeDue')}
              </p>
            )}
          </fieldset>
        </div>
      </CardBody>
    </Card>
  );
}
