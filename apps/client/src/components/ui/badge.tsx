import type { Health } from '@sims/contracts';
import { HEALTH_DISPLAY } from '@/lib/health';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning',
        danger: 'bg-danger-soft text-danger',
        neutral: 'bg-neutral-soft text-neutral',
        info: 'bg-primary-soft text-primary',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

const dots = {
  success: 'bg-success-dot',
  warning: 'bg-warning-dot',
  danger: 'bg-danger-dot',
  neutral: 'bg-neutral-dot',
  info: 'bg-primary',
} as const;

export type Tone = keyof typeof dots;

export interface BadgeProps
  extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
  /** A coloured dot before the text (never colour alone: the text says it too). */
  dot?: boolean;
}

export function Badge({
  tone,
  dot,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && (
        <span
          aria-hidden="true"
          className={cn('size-1.5 rounded-full', dots[tone ?? 'neutral'])}
        />
      )}
      {children}
    </span>
  );
}

export function HealthBadge({
  health,
  className,
}: {
  health: Health;
  className?: string;
}) {
  const { label, tone } = HEALTH_DISPLAY[health];
  return (
    <Badge tone={tone} dot className={className}>
      {label}
    </Badge>
  );
}
