import type { PackInitiativeRow } from '@sims/contracts';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatPercent } from '@/lib/format';
import { HEALTH_DISPLAY } from '@/lib/health';

/** Building blocks of the miniature preview pages. */
export function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
}) {
  return (
    <div className={cn('rounded-sm border border-border p-1', tone)}>
      <p className="truncate text-ink-muted">{label}</p>
      <p className="font-semibold text-ink">{value}</p>
    </div>
  );
}

export function MiniTable({
  headings,
  rows,
}: {
  headings: string[];
  rows: string[][];
}) {
  return (
    <table className="w-full">
      <thead>
        <tr>
          {headings.map((h) => (
            <th
              key={h}
              scope="col"
              className="bg-surface-muted px-1 text-left font-medium text-ink-muted"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-border">
            {row.map((cell, j) => (
              <td key={j} className="truncate px-1">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function InitiativeRows({ rows }: { rows: PackInitiativeRow[] }) {
  return (
    <MiniTable
      headings={['Initiative', 'Health', 'Verified', 'Gap']}
      rows={rows.map((i) => [
        `${i.code} ${i.title}`,
        HEALTH_DISPLAY[i.health].label,
        formatPercent(i.verifiedProgress),
        `${i.gapPp > 0 ? '+' : ''}${i.gapPp} pp`,
      ])}
    />
  );
}
