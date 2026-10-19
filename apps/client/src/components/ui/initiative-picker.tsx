import { useState } from 'react';
import { useApiQuery } from '@/lib/api/query';
import { useDebounced } from '@/lib/use-debounced';
import { SearchPicker } from './search-picker';

/**
 * Choose an active initiative (search by code, title or owner), e.g. the one
 * this initiative depends on. `exclude` hides initiatives that may not be
 * chosen, such as the initiative itself.
 */
export function InitiativePicker({
  label,
  value,
  onChange,
  exclude = [],
  hint,
  error,
  required,
}: {
  label: string;
  value: string | null;
  onChange: (initiativeId: string | null) => void;
  exclude?: string[];
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  const [text, setText] = useState('');
  const q = useDebounced(text, 250);
  const register = useApiQuery(
    'listInitiatives',
    { query: { tab: 'active', q: q || undefined, sort: 'code', pageSize: 10 } },
    { placeholderData: (previous) => previous },
  );
  return (
    <SearchPicker
      label={label}
      value={value}
      onChange={onChange}
      onSearch={setText}
      searching={register.isFetching}
      items={(register.data?.items ?? [])
        .filter((i) => !exclude.includes(i.id))
        .map((i) => ({
          id: i.id,
          label: `${i.code} · ${i.title}`,
          detail: i.owner?.jobTitle ?? i.pillar?.title ?? null,
        }))}
      placeholder="Search by code, title or owner"
      empty="No active initiative matches"
      hint={hint}
      error={error}
      required={required}
    />
  );
}
