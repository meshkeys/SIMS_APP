import type { PersonRef, Role } from '@sims/contracts';
import { useState } from 'react';
import { useApiQuery } from '@/lib/api/query';
import { useDebounced } from '@/lib/use-debounced';
import { SearchPicker } from './search-picker';

/**
 * Choose a person from the organisation's directory (name, email or job
 * title). Reused wherever someone is assigned: owner, sponsor, assignee.
 */
export function PeoplePicker({
  label,
  value,
  onChange,
  onlyRole,
  hint,
  error,
  required,
  initialPerson,
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
  /** Who is assigned now, so an edit form shows them before any search. */
  initialPerson?: PersonRef | null;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const q = useDebounced(text, 250);
  const members = useApiQuery(
    'listMembers',
    { query: { q: q || undefined, role: onlyRole, pageSize: 8 } },
    { placeholderData: (previous) => previous },
  );
  return (
    <SearchPicker
      label={label}
      value={value}
      onChange={onChange}
      onSearch={setText}
      searching={members.isFetching}
      items={(members.data?.items ?? []).map((m) => ({
        id: m.membershipId,
        label: m.name,
        detail:
          [m.jobTitle, m.department?.name].filter(Boolean).join(' · ') ||
          m.email,
      }))}
      initial={
        initialPerson
          ? {
              id: initialPerson.membershipId,
              label: initialPerson.name,
              detail: initialPerson.jobTitle,
            }
          : null
      }
      placeholder={placeholder}
      empty="No one matches"
      hint={hint}
      error={error}
      required={required}
    />
  );
}
