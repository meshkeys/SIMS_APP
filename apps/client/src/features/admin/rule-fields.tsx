import { type ComponentProps, type ReactNode, useId, useState } from 'react';
import { Input } from '@/components/ui/form';
import { cn } from '@/lib/cn';

/**
 * A whole-number input that can be cleared and retyped: it keeps its own text
 * and reports a number only when the text is one, so "10" can be typed into
 * an emptied field. A new value from outside (e.g. Discard) replaces the text.
 */
export function NumberInput({
  value,
  onValue,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: number;
  onValue: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (Number(text) !== value) setText(String(value));
  }
  return (
    <Input
      {...props}
      type="number"
      inputMode="numeric"
      step={1}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const next = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(next)) {
          setSeen(next);
          onValue(next);
        }
      }}
    />
  );
}

/** A whole-number setting with a unit ("30 days", "50 %"), its error under it. */
export function NumberSetting({
  label,
  value,
  onChange,
  unit,
  min = 0,
  max = 365,
  error,
  disabled,
  hint,
  className,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  min?: number;
  max?: number;
  error?: string;
  disabled?: boolean;
  hint?: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <span className="flex items-center gap-2">
        <NumberInput
          id={id}
          min={min}
          max={max}
          className="h-9 w-24"
          value={value}
          onValue={onChange}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? `${id}-error` : hint ? `${id}-hint` : undefined
          }
        />
        {unit && <span className="text-sm text-ink-muted">{unit}</span>}
      </span>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-ink-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** A switch-like rule: a checkbox with its title and what it means. */
export function RuleToggle({
  title,
  description,
  checked,
  onChange,
  disabled,
  children,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          className="mt-0.5 size-4 accent-primary"
          checked={checked}
          disabled={disabled}
          aria-describedby={`${id}-description`}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div>
          <label
            htmlFor={id}
            className="block cursor-pointer font-medium text-ink"
          >
            {title}
          </label>
          <p id={`${id}-description`} className="text-sm text-ink-muted">
            {description}
          </p>
        </div>
      </div>
      {children && <div className="pl-7">{children}</div>}
    </li>
  );
}
