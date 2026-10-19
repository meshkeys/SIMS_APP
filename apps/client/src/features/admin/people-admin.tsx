import { type MemberAdmin, ROLE_LABELS } from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useSession } from '@/auth/use-auth';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { errorMessage } from '@/lib/api/errors';
import { useApiMutation, useApiQuery } from '@/lib/api/query';
import { hasAnyRole } from '@/lib/access';
import { cn } from '@/lib/cn';
import { formatInstantDate } from '@/lib/format';
import { useDebounced } from '@/lib/use-debounced';
import { InviteDialog, type Notice, PendingInvitations } from './invitations';
import { DeactivateMemberDialog, EditMemberDialog } from './member-dialogs';
import { responsibilityList } from './responsibilities';

const STATUSES = [
  { key: 'ACTIVE', label: 'Active' },
  { key: 'INVITED', label: 'Invited' },
  { key: 'DEACTIVATED', label: 'Deactivated' },
] as const;
type Status = (typeof STATUSES)[number]['key'];

const PAGE_SIZE = 25;

/** Who has access, with which roles: invite, change and end access. */
export function PeopleAdmin() {
  const session = useSession();
  const canManageAdmins = hasAnyRole(session, ['SYSTEM_ADMIN']);
  const [status, setStatus] = useState<Status>('ACTIVE');
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 250);
  const [page, setPage] = useState(1);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<MemberAdmin | null>(null);
  const [deactivating, setDeactivating] = useState<MemberAdmin | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const members = useApiQuery(
    'listMembersAdmin',
    {
      query: { status, q: q || undefined, page, pageSize: PAGE_SIZE },
    },
    { placeholderData: (previous) => previous },
  );
  const counts = members.data?.counts;
  const pages = members.data
    ? Math.max(1, Math.ceil(members.data.total / PAGE_SIZE))
    : 1;
  const done = (text: string) => setNotice({ tone: 'success', text });

  return (
    <>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <Card aria-labelledby="people-title">
        <CardHeader
          titleId="people-title"
          title="Users & roles"
          description="Roles decide what each person can see and do. Changes apply from their next session refresh, within 15 minutes."
          action={
            <Button size="sm" onClick={() => setInviting(true)}>
              <UserPlus aria-hidden="true" />
              Invite someone
            </Button>
          }
        />
        <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-4">
          <fieldset className="flex flex-wrap gap-1">
            <legend className="sr-only">Show members by status</legend>
            {STATUSES.map((s) => (
              <Button
                key={s.key}
                size="sm"
                variant={status === s.key ? 'primary' : 'secondary'}
                aria-pressed={status === s.key}
                onClick={() => {
                  setStatus(s.key);
                  setPage(1);
                }}
              >
                {s.label}
                {counts && ` (${counts[s.key]})`}
              </Button>
            ))}
          </fieldset>
          <Field label="Search people" className="w-full sm:w-64">
            {(control) => (
              <Input
                {...control}
                type="search"
                value={text}
                placeholder="Name, email or job title"
                onChange={(e) => {
                  setText(e.target.value);
                  setPage(1);
                }}
              />
            )}
          </Field>
        </div>

        {members.isPending ? (
          <div className="p-5">
            <output className="sr-only">Loading people…</output>
            <Skeleton className="h-64" />
          </div>
        ) : members.isError ? (
          <ErrorState
            error={members.error}
            onRetry={() => void members.refetch()}
          />
        ) : members.data.items.length === 0 ? (
          <EmptyState
            title={q ? `Nobody matches “${q}”` : 'Nobody here'}
            description={
              q
                ? 'Try another name, email or job title.'
                : status === 'DEACTIVATED'
                  ? 'Nobody has been deactivated.'
                  : 'Invite people to give them access.'
            }
          />
        ) : (
          <div
            className={cn(
              'overflow-x-auto p-5 pt-4',
              members.isPlaceholderData && 'opacity-60',
            )}
          >
            <table className="w-full text-sm">
              <caption className="sr-only">
                {STATUSES.find((s) => s.key === status)?.label} members, by name
              </caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-ink-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Person
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Department
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Roles
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Accountable for
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.data.items.map((member) => (
                  <MemberRow
                    key={member.membershipId}
                    member={member}
                    isYou={member.membershipId === session.membership.id}
                    onEdit={() => setEditing(member)}
                    onDeactivate={() => setDeactivating(member)}
                    onReactivated={done}
                  />
                ))}
              </tbody>
            </table>
            {pages > 1 && (
              <nav
                aria-label="Pages of people"
                className="mt-4 flex items-center justify-end gap-2 text-sm text-ink-muted"
              >
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span>
                  Page {page} of {pages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </nav>
            )}
          </div>
        )}
      </Card>

      <PendingInvitations onNotice={setNotice} />

      {inviting && (
        <InviteDialog
          canManageAdmins={canManageAdmins}
          onClose={() => setInviting(false)}
          onSent={(sent) => {
            setNotice(sent);
            setInviting(false);
          }}
        />
      )}
      {editing && (
        <EditMemberDialog
          member={editing}
          canManageAdmins={canManageAdmins}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            done(text);
            setEditing(null);
          }}
        />
      )}
      {deactivating && (
        <DeactivateMemberDialog
          member={deactivating}
          onClose={() => setDeactivating(null)}
          onDone={(text) => {
            done(text);
            setDeactivating(null);
          }}
        />
      )}
    </>
  );
}

function MemberRow({
  member,
  isYou,
  onEdit,
  onDeactivate,
  onReactivated,
}: {
  member: MemberAdmin;
  isYou: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivated: (text: string) => void;
}) {
  const { organisation } = useSession();
  const queryClient = useQueryClient();
  const reactivate = useApiMutation('reactivateMember', {
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      onReactivated(`${member.name} can sign in again, with the same roles.`);
    },
  });
  const held = responsibilityList(member);
  return (
    <tr className="border-b border-border align-top">
      <th scope="row" className="py-3 pr-4 text-left font-normal">
        <span className="block font-medium text-ink">
          {member.name}
          {isYou && <span className="text-ink-muted"> (you)</span>}
        </span>
        <span className="block text-xs text-ink-muted">{member.email}</span>
        {member.jobTitle && (
          <span className="block text-xs text-ink-muted">
            {member.jobTitle}
          </span>
        )}
      </th>
      <td className="py-3 pr-4 text-ink-muted">
        {member.department?.name ?? '—'}
        {member.manager && (
          <span className="block text-xs">
            Reports to {member.manager.name}
          </span>
        )}
      </td>
      <td className="py-3 pr-4">
        <ul className="flex flex-wrap gap-1">
          {member.roles.map((role) => (
            <li key={role}>
              <Badge tone={role === 'SYSTEM_ADMIN' ? 'info' : 'neutral'}>
                {ROLE_LABELS[role]}
              </Badge>
            </li>
          ))}
        </ul>
        {member.joinedAt && (
          <span className="mt-1 block text-xs text-ink-subtle">
            Joined {formatInstantDate(member.joinedAt, organisation.timezone)}
          </span>
        )}
      </td>
      <td className="py-3 pr-4 text-ink-muted">
        {held.length > 0 ? held.join('; ') : '—'}
      </td>
      <td className="py-3">
        <div className="flex justify-end gap-1">
          {member.can.edit && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Edit ${member.name}`}
              onClick={onEdit}
            >
              Edit
            </Button>
          )}
          {member.can.deactivate && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Deactivate ${member.name}`}
              onClick={onDeactivate}
            >
              Deactivate
            </Button>
          )}
          {member.can.reactivate && (
            <Button
              variant="secondary"
              size="sm"
              loading={reactivate.isPending}
              aria-label={`Reactivate ${member.name}`}
              onClick={() =>
                reactivate.mutate({ params: { id: member.membershipId } })
              }
            >
              Reactivate
            </Button>
          )}
        </div>
        {reactivate.isError && (
          <p role="alert" className="mt-1 text-right text-sm text-danger">
            {errorMessage(reactivate.error)}
          </p>
        )}
      </td>
    </tr>
  );
}
