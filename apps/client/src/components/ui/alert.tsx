import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const tones = {
  info: { box: 'bg-primary-soft text-primary', Icon: Info },
  success: { box: 'bg-success-soft text-success', Icon: CircleCheck },
  warning: { box: 'bg-warning-soft text-warning', Icon: TriangleAlert },
  danger: { box: 'bg-danger-soft text-danger', Icon: CircleAlert },
} as const;

/**
 * An inline message. Errors use role="alert" so they are announced as soon
 * as they appear; everything else is a polite status.
 */
export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: keyof typeof tones;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const { box, Icon } = tones[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-md px-4 py-3 text-sm', box, className)}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5')}>{children}</div>}
      </div>
    </div>
  );
}
