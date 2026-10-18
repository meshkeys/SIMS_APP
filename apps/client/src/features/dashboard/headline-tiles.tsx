import type { Dashboard, Health } from '@sims/contracts';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatPercent, plural } from '@/lib/format';

/** The headline numbers. Each tile opens the register filtered to it. */
export function HeadlineTiles({
  tiles,
  pillarCount,
}: {
  tiles: Dashboard['tiles'];
  pillarCount: number;
}) {
  const share = (n: number) =>
    tiles.active ? formatPercent((n / tiles.active) * 100, 1) : '—';
  return (
    <section aria-label="Headline figures">
      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          label="Total initiatives"
          value={tiles.active}
          note={`Across ${plural(pillarCount, 'strategic pillar')}`}
          dot="bg-neutral-dot"
          to="/initiatives"
        />
        <Tile
          label="On track"
          value={tiles.onTrack}
          note={`${share(tiles.onTrack)} of portfolio`}
          dot="bg-success-dot"
          to="/initiatives"
          health="GREEN"
        />
        <Tile
          label="At risk"
          value={tiles.atRisk}
          note="Management attention"
          dot="bg-warning-dot"
          to="/initiatives"
          health="AMBER"
        />
        <Tile
          label="Delayed"
          value={tiles.delayed}
          note="Escalation required"
          dot="bg-danger-dot"
          to="/initiatives"
          health="RED"
        />
        {tiles.updatesOutstanding !== null && (
          <Tile
            label="Updates outstanding"
            value={tiles.updatesOutstanding}
            note="Due in this cycle"
            dot="bg-primary"
            to="/my-updates"
            className="col-span-2 lg:col-span-1"
          />
        )}
        {tiles.unknown > 0 && (
          <Tile
            label="Status unknown"
            value={tiles.unknown}
            note="No verified update last cycle"
            dot="bg-neutral-dot"
            to="/initiatives"
            health="UNKNOWN"
          />
        )}
      </ul>
    </section>
  );
}

function Tile({
  label,
  value,
  note,
  dot,
  to,
  health,
  className,
}: {
  label: string;
  value: number;
  note: ReactNode;
  dot: string;
  to: string;
  health?: Health;
  className?: string;
}) {
  return (
    <li className={className}>
      <Link
        to={to}
        search={health ? { health } : undefined}
        className="block h-full rounded-card border border-border bg-surface p-5 shadow-card transition-colors hover:border-border-strong"
      >
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <span aria-hidden="true" className={cn('size-2 rounded-full', dot)} />
          {label}
        </p>
        <p className="tabular mt-2 text-3xl font-semibold text-ink">{value}</p>
        <p className="mt-1 text-sm text-ink-muted">{note}</p>
      </Link>
    </li>
  );
}
