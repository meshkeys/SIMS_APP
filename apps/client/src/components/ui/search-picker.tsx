import { useCombobox } from 'downshift';
import { X } from 'lucide-react';
import { useId, useState } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './spinner';

export interface PickerItem {
  id: string;
  /** Shown in the input once chosen, and as the option's first line. */
  label: string;
  /** Second line in the list and under the input (e.g. job title). */
  detail?: string | null;
}

/**
 * Choose one item from a server-side search: type to search, pick with mouse
 * or keyboard (↑ ↓ Enter, Esc to close), clear with the × button. Built on
 * Downshift's accessible combobox. The caller runs the search (`onSearch`)
 * and passes the results in `items`.
 */
export function SearchPicker({
  label,
  value,
  onChange,
  items,
  searching,
  onSearch,
  initial,
  hint,
  error,
  required,
  placeholder = 'Type to search',
  empty = 'Nothing matches',
}: {
  label: string;
  /** The chosen item's id, or null. */
  value: string | null;
  onChange: (id: string | null) => void;
  /** Results for the current search text. */
  items: PickerItem[];
  searching: boolean;
  /** Called with the text to search for (empty = show the first results). */
  onSearch: (text: string) => void;
  /** The current choice, so an edit form shows it before any search. */
  initial?: PickerItem | null;
  hint?: string;
  error?: string;
  required?: boolean;
  placeholder?: string;
  empty?: string;
}) {
  const ids = useId();
  const start = initial && initial.id === value ? initial : null;
  const [inputValue, setInputValue] = useState(start?.label ?? '');
  const [selected, setSelected] = useState<PickerItem | null>(start);

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
  } = useCombobox<PickerItem>({
    items,
    itemToString: (item) => item?.label ?? '',
    itemToKey: (item) => item?.id,
    selectedItem: selected,
    inputValue,
    onInputValueChange: ({ inputValue: next = '' }) => {
      setInputValue(next);
      // Searching for the chosen item's own name would hide everything else.
      onSearch(selected && next === selected.label ? '' : next.trim());
    },
    onSelectedItemChange: ({ selectedItem }) => {
      setSelected(selectedItem ?? null);
      onChange(selectedItem?.id ?? null);
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
              onSearch('');
            }}
            className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-ink-subtle hover:bg-neutral-soft hover:text-ink"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>
      {selected?.detail && (
        <p className="text-xs text-ink-muted">{selected.detail}</p>
      )}
      <ul
        {...getMenuProps()}
        className={cn(
          'absolute top-full z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg',
          !isOpen && 'hidden',
        )}
      >
        {isOpen &&
          items.map((item, index) => (
            <li
              key={item.id}
              {...getItemProps({ item, index })}
              className={cn(
                'cursor-pointer px-3 py-2 text-sm',
                highlightedIndex === index && 'bg-neutral-soft',
                selected?.id === item.id && 'font-medium',
              )}
            >
              <span className="block text-ink">{item.label}</span>
              {item.detail && (
                <span className="block text-xs text-ink-muted">
                  {item.detail}
                </span>
              )}
            </li>
          ))}
        {isOpen && items.length === 0 && (
          <li className="px-3 py-2 text-sm text-ink-muted">
            {searching ? <Spinner size="sm" label="Searching…" /> : empty}
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
