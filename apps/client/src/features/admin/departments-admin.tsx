import type { Department } from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { useApiMutation, useApiQuery } from '@/lib/api/query';
import { plural } from '@/lib/format';

interface TreeRow {
  department: Department;
  depth: number;
}

/** Departments in tree order: each followed by its sub-departments, by name. */
function departmentTree(departments: Department[]): TreeRow[] {
  const ids = new Set(departments.map((d) => d.id));
  const rows: TreeRow[] = [];
  const visit = (parentId: string | null, depth: number) => {
    departments
      .filter((d) =>
        parentId === null
          ? d.parentId === null || !ids.has(d.parentId)
          : d.parentId === parentId,
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((department) => {
        rows.push({ department, depth });
        visit(department.id, depth + 1);
      });
  };
  visit(null, 0);
  return rows;
}

/** The department and everything beneath it: none of them can be its parent. */
function selfAndBelow(departments: Department[], id: string): Set<string> {
  const found = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of departments) {
      if (d.parentId && found.has(d.parentId) && !found.has(d.id)) {
        found.add(d.id);
        grew = true;
      }
    }
  }
  return found;
}

type Editing = { mode: 'add' } | { mode: 'edit'; department: Department };

/** Add, rename, recode, nest and delete empty departments. */
export function DepartmentsAdmin() {
  const departments = useApiQuery('listDepartments', {});
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Department | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const addButton = (
    <Button size="sm" onClick={() => setEditing({ mode: 'add' })}>
      <Plus aria-hidden="true" />
      Add department
    </Button>
  );

  let body;
  if (departments.isPending) {
    body = (
      <div className="p-5">
        <output className="sr-only">Loading departments…</output>
        <Skeleton className="h-48" />
      </div>
    );
  } else if (departments.isError) {
    body = (
      <ErrorState
        error={departments.error}
        onRetry={() => void departments.refetch()}
      />
    );
  } else if (departments.data.length === 0) {
    body = (
      <EmptyState
        title="No departments yet"
        description="Add the departments initiatives and people belong to."
        action={addButton}
      />
    );
  } else {
    body = (
      <div className="overflow-x-auto p-5 pt-4">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Departments, with sub-departments indented
          </caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-ink-muted">
              <th scope="col" className="py-2 pr-4 font-medium">
                Department
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Code
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Active members
              </th>
              <th scope="col" className="py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {departmentTree(departments.data).map(({ department, depth }) => (
              <tr key={department.id} className="border-b border-border">
                <th
                  scope="row"
                  className="py-2 pr-4 text-left font-medium text-ink"
                  style={{ paddingLeft: `${depth * 1.5}rem` }}
                >
                  {depth > 0 && (
                    <span aria-hidden="true" className="mr-1 text-ink-subtle">
                      ↳
                    </span>
                  )}
                  {department.name}
                </th>
                <td className="py-2 pr-4 text-ink-muted">
                  {department.code ?? '—'}
                </td>
                <td className="py-2 pr-4 text-ink-muted">
                  {department.memberCount}
                </td>
                <td className="py-2">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit ${department.name}`}
                      onClick={() => setEditing({ mode: 'edit', department })}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete ${department.name}`}
                      onClick={() => setDeleting(department)}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const all = departments.data ?? [];
  return (
    <Card aria-labelledby="departments-title">
      <CardHeader
        titleId="departments-title"
        title="Departments"
        description="Initiatives and people belong to departments. Departments can sit inside others."
        action={all.length > 0 && addButton}
      />
      {notice && (
        <div className="px-5 pt-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}
      {body}
      {editing && (
        <DepartmentDialog
          editing={editing}
          departments={all}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setNotice(message);
            setEditing(null);
          }}
        />
      )}
      {deleting && (
        <DeleteDepartmentDialog
          department={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setNotice(`${deleting.name} was deleted.`);
            setDeleting(null);
          }}
        />
      )}
    </Card>
  );
}

function DepartmentDialog({
  editing,
  departments,
  onClose,
  onSaved,
}: {
  editing: Editing;
  departments: Department[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const current = editing.mode === 'edit' ? editing.department : null;
  const [name, setName] = useState(current?.name ?? '');
  const [code, setCode] = useState(current?.code ?? '');
  const [parentId, setParentId] = useState(current?.parentId ?? '');
  const queryClient = useQueryClient();
  const onSuccess = async (saved: Department) => {
    await queryClient.invalidateQueries();
    onSaved(
      current ? `${saved.name} was updated.` : `${saved.name} was added.`,
    );
  };
  const create = useApiMutation('createDepartment', { onSuccess });
  const update = useApiMutation('updateDepartment', { onSuccess });
  const mutation = current ? update : create;
  const fieldErrors =
    mutation.error instanceof ApiError ? mutation.error.fieldErrors : {};
  const nameError =
    fieldErrors.name ??
    (mutation.error instanceof ApiError && mutation.error.code === 'NAME_TAKEN'
      ? errorMessage(mutation.error)
      : undefined);
  const otherError =
    mutation.isError &&
    !nameError &&
    Object.keys(fieldErrors).length === 0 &&
    errorMessage(mutation.error);

  const excluded = current ? selfAndBelow(departments, current.id) : new Set();
  const parents = departmentTree(departments).filter(
    (row) => !excluded.has(row.department.id),
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const values = {
      name: name.trim(),
      code: code.trim() || null,
      parentId: parentId || null,
    };
    if (current) {
      const body = Object.fromEntries(
        Object.entries(values).filter(
          ([key, value]) => current[key as keyof typeof values] !== value,
        ),
      );
      if (Object.keys(body).length === 0) return onClose();
      update.mutate({ params: { id: current.id }, body });
    } else {
      create.mutate({ body: values });
    }
  };

  const formId = 'department-form';
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={current ? `Edit ${current.name}` : 'Add a department'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={mutation.isPending}>
            {current ? 'Save changes' : 'Add department'}
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
        <Field label="Name" required error={nameError}>
          {(control) => (
            <Input
              {...control}
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Code"
          hint="Optional short code, e.g. FIN"
          error={fieldErrors.code}
        >
          {(control) => (
            <Input
              {...control}
              value={code}
              maxLength={20}
              onChange={(e) => setCode(e.target.value)}
            />
          )}
        </Field>
        <Field label="Sits inside" error={fieldErrors.parentId}>
          {(control) => (
            <Select
              {...control}
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">Nothing (top level)</option>
              {parents.map(({ department, depth }) => (
                <option key={department.id} value={department.id}>
                  {'  '.repeat(depth)}
                  {department.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </form>
    </Dialog>
  );
}

function DeleteDepartmentDialog({
  department,
  onClose,
  onDeleted,
}: {
  department: Department;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const remove = useApiMutation('deleteDepartment', {
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      onDeleted();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Delete ${department.name}?`}
      description="Only an empty department can be deleted: no members, initiatives or sub-departments."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => remove.mutate({ params: { id: department.id } })}
          >
            Delete department
          </Button>
        </>
      }
    >
      {remove.isError ? (
        <Alert tone="danger">{errorMessage(remove.error)}</Alert>
      ) : (
        <p className="text-sm text-ink">
          {department.memberCount > 0
            ? `${department.name} has ${plural(department.memberCount, 'active member')}. Move them to another department first.`
            : 'This cannot be undone. The change is recorded in the audit log.'}
        </p>
      )}
    </Dialog>
  );
}
