import type { Member, Role } from '@sims/contracts';
import { useCombobox } from 'downshift';
import { X } from 'lucide-react';
import { useId, useState } from 'react';
import { useApiQuery } from '@/lib/api/query';
import { cn } from '@/lib/cn';
import { useDebounced } from '@/lib/use-debounced';
import { Spinner } from './spinner';

/**
 * Choose a person from the organisation's directory: type to search by name,
 * email or job title, pick with mouse or keyboard (↑ ↓ Enter, Esc to close).
 * Built on Downshift's accessible combobox; reused wherever someone is
 * assigned (owner, sponsor, assignee, decision owner).
 */
export function PeoplePicker({
  label,
  value,
  onChange,
  onlyRole,
  hint,
  error,
  required,
  placeholder = 'Search by name or job title',
}: {
  label: string;
  /** The chosen membership id, or null. */
  value: string | null;
  onChange: (membershipId: string | null) => void;
  /** Only offer people holding this role (e.g. sponsors). */
  onlyRole?: Role;
  hint?: string;
  error?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const ids = useId();
  const [inputValue, setInputValue] = useState('');
  const [selected, setSelected] = useState<Member | null>(null);
  const query = useDebounced(inputValue.trim(), 250);
  // Searching for the chosen person's own name would hide everyone else.
  const searching = selected && inputValue === selected.name ? '' : query;
  const members = useApiQuery(
    'listMembers',
    { query: { q: searching || undefined, role: onlyRole, pageSize: 8 } },
    { placeholderData: (previous) => previous },
  );
  const items = members.data?.items ?? [];

  // The form was reset or cleared from outside.
  if (value === null && selected) {
    setSelected(null);
    setInputValue('');
  }

  const {
    isOpen,
    getLabelProps,
    getInputProps,
    getMenuProps,
    getItemProps,
    highlightedIndex,
    selectItem,
  } = useCombobox<Member>({
    items,
    itemToString: (member) => member?.name ?? '',
    itemToKey: (member) => member?.membershipId,
    selectedItem: selected,
    inputValue,
    onInputValueChange: ({ inputValue: next }) => setInputValue(next ?? ''),
    onSelectedItemChange: ({ selectedItem }) => {
      setSelected(selectedItem ?? null);
      onChange(selectedItem?.membershipId ?? null);
    },
  });

  const hintId = hint ? `${ids}-hint` : undefined;
  const errorId = error ? `${ids}-error` : undefined;

  return (
    <div className="relative flex flex-col gap-1.5">
      <label {...getLabelProps()} className="text-sm font-medium text-ink">
        {label}
        {required && (
          <span aria-hidden="true" className="text-danger">
            {' '}
            *
          </span>
        )}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-ink-subtle">
          {hint}
        </p>
      )}
      <div className="relative">
        <input
          {...getInputProps({
            placeholder,
            'aria-describedby':
              [hintId, errorId].filter(Boolean).join(' ') || undefined,
            'aria-invalid': error ? true : undefined,
            'aria-required': required || undefined,
          })}
          className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 pr-9 text-sm text-ink placeholder:text-ink-subtle hover:border-ink-subtle focus-visible:border-primary aria-invalid:border-danger"
        />
        {selected && (
          <button
            type="button"
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={() => {
              selectItem(null);
              setInputValue('');
            }}
            className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-ink-subtle hover:bg-neutral-soft hover:text-ink"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>
      {selected?.jobTitle && (
        <p className="text-xs text-ink-muted">
          {selected.jobTitle}
          {selected.department && ` · ${selected.department.name}`}
        </p>
      )}
      <ul
        {...getMenuProps()}
        className={cn(
          'absolute top-full z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg',
          !isOpen && 'hidden',
        )}
      >
        {isOpen &&
          items.map((member, index) => (
            <li
              key={member.membershipId}
              {...getItemProps({ item: member, index })}
              className={cn(
                'cursor-pointer px-3 py-2 text-sm',
                highlightedIndex === index && 'bg-neutral-soft',
                selected?.membershipId === member.membershipId && 'font-medium',
              )}
            >
              <span className="block text-ink">{member.name}</span>
              <span className="block text-xs text-ink-muted">
                {[member.jobTitle, member.department?.name]
                  .filter(Boolean)
                  .join(' · ') || member.email}
              </span>
            </li>
          ))}
        {isOpen && items.length === 0 && (
          <li className="px-3 py-2 text-sm text-ink-muted">
            {members.isFetching ? (
              <Spinner size="sm" label="Searching…" />
            ) : (
              'No one matches'
            )}
          </li>
        )}
      </ul>
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
