import type { EscalationItem } from '@sims/contracts';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';
import { ageTone, deciderLabel, escalationKind } from './labels';

/** Open escalations, oldest first: what is waiting, for whom, and how long. */
export function OpenEscalations({
  items,
  level,
  selectedId,
  onOpen,
  onClearLevel,
}: {
  items: EscalationItem[];
  level: { level: number; name: string } | undefined;
  selectedId: string | undefined;
  onOpen: (id: string) => void;
  onClearLevel: () => void;
}) {
  const th = 'px-3 py-2.5 text-left text-xs font-medium text-ink-muted';
  return (
    <Card aria-labelledby="open-escalations-title" className="min-w-0">
      <CardHeader
        titleId="open-escalations-title"
        title={
          level ? `Open escalations at L${level.level}` : 'Open escalations'
        }
        description={level ? level.name : undefined}
        action={
          level ? (
            <Button variant="link" size="sm" onClick={onClearLevel}>
              Show all levels
            </Button>
          ) : (
            <span className="text-ink-muted">Oldest first</span>
          )
        }
      />
      {items.length === 0 ? (
        <EmptyState
          className="py-8"
          title="Nothing is waiting"
          description={
            level
              ? `No open escalations at ${level.name}.`
              : 'No open escalations. Problems raised on initiatives appear here.'
          }
        />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <caption className="sr-only">
              {plural(items.length, 'open escalation')}, oldest first
            </caption>
            <thead className="bg-surface-muted">
              <tr>
                <th scope="col" className={cn(th, 'pl-5')}>
                  Level
                </th>
                <th scope="col" className={th}>
                  Issue
                </th>
                <th scope="col" className={th}>
                  Initiative
                </th>
                <th scope="col" className={th}>
                  Age
                </th>
                <th scope="col" className={th}>
                  Decision needed from
                </th>
                <th scope="col" className={cn(th, 'pr-5')}>
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr
                  key={item.id}
                  className={cn(item.id === selectedId && 'bg-primary-soft')}
                >
                  <td className="px-3 py-3 pl-5">
                    <span className="sr-only">
                      Level {item.level}, {item.levelName}
                    </span>
                    <Badge
                      aria-hidden="true"
                      tone={
                        item.level >= 3
                          ? 'danger'
                          : item.level === 2
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      L{item.level}
                    </Badge>
                  </td>
                  <th scope="row" className="px-3 py-3 text-left font-normal">
                    <span className="block font-medium text-ink">
                      {item.title}
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {escalationKind(item)}
                    </span>
                  </th>
                  <td className="px-3 py-3">
                    {item.initiative ? (
                      <Link
                        to="/initiatives/$id"
                        params={{ id: item.initiative.id }}
                        className="text-primary underline underline-offset-2"
                      >
                        {item.initiative.code} {item.initiative.title}
                      </Link>
                    ) : (
                      <span className="text-ink-muted">Portfolio</span>
                    )}
                  </td>
                  <td
                    className={cn(
                      'tabular px-3 py-3 whitespace-nowrap',
                      ageTone(item.ageDays),
                    )}
                  >
                    {plural(item.ageDays, 'day')}
                  </td>
                  <td className="px-3 py-3">{deciderLabel(item)}</td>
                  <td className="px-3 py-3 pr-5">
                    <Button
                      size="sm"
                      variant={item.id === selectedId ? 'primary' : 'secondary'}
                      aria-label={`Open ${item.reference}`}
                      onClick={() => onOpen(item.id)}
                    >
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
