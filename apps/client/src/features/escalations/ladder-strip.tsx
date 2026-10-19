import type { EscalationCentre } from '@sims/contracts';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';

/**
 * The organisation's ladder with the open count at each level. Each level
 * filters the open escalations below; the one the critical shortcut lands on
 * is tinted when it has items.
 */
export function LadderStrip({
  centre,
  selected,
  onSelect,
}: {
  centre: EscalationCentre;
  selected: number | undefined;
  onSelect: (level: number | undefined) => void;
}) {
  return (
    <Card aria-labelledby="ladder-title">
      <CardHeader
        titleId="ladder-title"
        title="Escalation ladder"
        action={
          <span className="text-ink-muted">
            Unresolved items move up automatically. Rules set in Administration.
          </span>
        }
      />
      <CardBody>
        <ul
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(auto-fit, minmax(10rem, 1fr))`,
          }}
        >
          {centre.ladder.map((level) => {
            const pressed = selected === level.level;
            const hot =
              level.open > 0 && level.level === centre.criticalStartsAtLevel;
            return (
              <li key={level.level}>
                <button
                  type="button"
                  aria-pressed={pressed}
                  aria-label={`L${level.level} ${level.name}: ${plural(level.open, 'open escalation')}`}
                  onClick={() => onSelect(pressed ? undefined : level.level)}
                  className={cn(
                    'flex h-full w-full flex-col rounded-md border p-4 text-left transition-colors',
                    hot
                      ? 'border-danger-dot/40 bg-danger-soft'
                      : 'border-border bg-surface hover:border-border-strong',
                    pressed && 'ring-2 ring-primary ring-offset-1',
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium text-ink-muted">
                      L{level.level}
                    </span>
                    <span className="tabular text-2xl font-semibold text-ink">
                      {level.open}
                    </span>
                  </span>
                  <span className="mt-2 font-medium text-ink">
                    {level.name}
                  </span>
                  {level.description && (
                    <span className="mt-0.5 text-xs text-ink-muted">
                      {level.description}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}
