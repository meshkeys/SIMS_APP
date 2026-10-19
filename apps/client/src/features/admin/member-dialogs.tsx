import {
  type MemberAdmin,
  ROLE_LABELS,
  type Role,
  type UpdateMemberInput,
} from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { PeoplePicker } from '@/components/ui/people-picker';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { useApiMutation, useApiQuery } from '@/lib/api/query';
import { responsibilityList } from './responsibilities';

const ROLES = Object.keys(ROLE_LABELS) as Role[];

/** Role checkboxes. Only an administrator grants or removes the administrator role. */
export function RoleChoices({
  value,
  onChange,
  canManageAdmins,
  error,
}: {
  value: Role[];
  onChange: (roles: Role[]) => void;
  canManageAdmins: boolean;
  error?: string;
}) {
  const errorId = 'role-choices-error';
  return (
    <fieldset
      aria-describedby={error ? errorId : undefined}
      className="flex flex-col gap-2"
    >
      <legend className="text-sm font-medium text-ink">
        Roles
        <span aria-hidden="true" className="text-danger">
          {' '}
          *
        </span>
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {ROLES.map((role) => {
          const locked = role === 'SYSTEM_ADMIN' && !canManageAdmins;
          return (
            <label
              key={role}
              className="flex items-center gap-2 text-sm text-ink has-disabled:text-ink-subtle"
            >
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={value.includes(role)}
                disabled={locked}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...value, role]
                      : value.filter((r) => r !== role),
                  )
                }
              />
              {ROLE_LABELS[role]}
            </label>
          );
        })}
      </div>
      {!canManageAdmins && (
        <p className="text-xs text-ink-subtle">
          Only a system administrator can grant or remove the system
          administrator role.
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Departments as select options; the list is short, so no search. */
export function DepartmentSelect({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (departmentId: string) => void;
  error?: string;
}) {
  const departments = useApiQuery('listDepartments', {});
  return (
    <Field label="Department" error={error}>
      {(control) => (
        <Select
          {...control}
          value={value}
          disabled={departments.isPending}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">No department</option>
          {(departments.data ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

export function EditMemberDialog({
  member,
  canManageAdmins,
  onClose,
  onSaved,
}: {
  member: MemberAdmin;
  canManageAdmins: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [roles, setRoles] = useState<Role[]>(member.roles);
  const [jobTitle, setJobTitle] = useState(member.jobTitle ?? '');
  const [departmentId, setDepartmentId] = useState(member.department?.id ?? '');
  const [managerId, setManagerId] = useState<string | null>(
    member.manager?.membershipId ?? null,
  );
  const queryClient = useQueryClient();
  const save = useApiMutation('updateMember', {
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries();
      onSaved(
        roles.join() === member.roles.join()
          ? `${updated.name} was updated.`
          : `${updated.name} was updated. New roles apply from their next session refresh, within 15 minutes.`,
      );
    },
  });
  const fieldErrors =
    save.error instanceof ApiError ? save.error.fieldErrors : {};
  const otherError =
    save.isError && Object.keys(fieldErrors).length === 0
      ? errorMessage(save.error)
      : null;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const body: UpdateMemberInput = {};
    const sameRoles =
      roles.length === member.roles.length &&
      roles.every((r) => member.roles.includes(r));
    if (!sameRoles) body.roles = roles;
    if (jobTitle.trim() !== (member.jobTitle ?? ''))
      body.jobTitle = jobTitle.trim() || null;
    if (departmentId !== (member.department?.id ?? ''))
      body.departmentId = departmentId || null;
    if (managerId !== (member.manager?.membershipId ?? null))
      body.managerId = managerId;
    if (Object.keys(body).length === 0) return onClose();
    save.mutate({ params: { id: member.membershipId }, body });
  };

  const formId = 'edit-member-form';
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Edit ${member.name}`}
      description={member.email}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={save.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-4"
      >
        {otherError && <Alert tone="danger">{otherError}</Alert>}
        <RoleChoices
          value={roles}
          onChange={setRoles}
          canManageAdmins={canManageAdmins}
          error={
            fieldErrors.roles ??
            (roles.length === 0 ? 'Keep at least one role' : undefined)
          }
        />
        <Field label="Job title" error={fieldErrors.jobTitle}>
          {(control) => (
            <Input
              {...control}
              value={jobTitle}
              maxLength={120}
              onChange={(e) => setJobTitle(e.target.value)}
            />
          )}
        </Field>
        <DepartmentSelect
          value={departmentId}
          onChange={setDepartmentId}
          error={fieldErrors.departmentId}
        />
        <PeoplePicker
          label="Manager"
          value={managerId}
          onChange={setManagerId}
          initialPerson={member.manager}
          error={fieldErrors.managerId}
        />
      </form>
    </Dialog>
  );
}

export function DeactivateMemberDialog({
  member,
  onClose,
  onDone,
}: {
  member: MemberAdmin;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const deactivate = useApiMutation('deactivateMember', {
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      onDone(
        `${member.name} can no longer sign in. Any open session ends within 15 minutes.`,
      );
    },
  });
  const held = responsibilityList(member);
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Deactivate ${member.name}?`}
      description="They will no longer be able to sign in. Everything they did stays on record, and you can restore access later."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={deactivate.isPending}
            onClick={() =>
              deactivate.mutate({ params: { id: member.membershipId } })
            }
          >
            Deactivate
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {deactivate.isError && (
          <Alert tone="danger">{errorMessage(deactivate.error)}</Alert>
        )}
        {held.length > 0 ? (
          <Alert tone="warning" title="Hand over their responsibilities first">
            {member.name} {held.join(', ')}. Reassign these so nothing is left
            without an owner.
          </Alert>
        ) : (
          <p className="text-sm text-ink">
            {member.name} has no live initiatives or waiting decisions.
          </p>
        )}
      </div>
    </Dialog>
  );
}
