import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateTaskInput,
  createTaskSchema,
  type InitiativeDetail,
  TaskStatus,
} from '@sims/contracts';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/form';
import { PeoplePicker } from '@/components/ui/people-picker';
import { EmptyState } from '@/components/ui/states';
import { errorMessage } from '@/lib/api/errors';
import { useApiMutation } from '@/lib/api/query';
import { formatDate } from '@/lib/format';
import { useApplyDetail } from './use-apply-detail';

type Milestone = InitiativeDetail['milestones'][number];
type Task = Milestone['tasks'][number];

const STATUS_WORDS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
  BLOCKED: 'Blocked',
};
const STATUS_TONE = {
  TODO: 'neutral',
  IN_PROGRESS: 'info',
  DONE: 'success',
  BLOCKED: 'danger',
} as const;

/**
 * Tasks under each milestone. People working on the initiative can add
 * tasks, move them through To do → In progress → Done (or Blocked) and
 * remove them; everyone else sees them read-only.
 */
export function TaskBoard({ initiative }: { initiative: InitiativeDetail }) {
  const editable = initiative.can.manageWork;
  const milestones = editable
    ? initiative.milestones
    : initiative.milestones.filter((m) => m.tasks.length > 0);

  return (
    <Card className="mt-5" aria-labelledby="tasks-title">
      <CardHeader titleId="tasks-title" title="Tasks" />
      <CardBody className="pt-3">
        {milestones.length === 0 ? (
          <EmptyState className="py-6" title="No tasks yet" />
        ) : (
          <div className="flex flex-col gap-6">
            {milestones.map((m) => (
              <MilestoneTasks
                key={m.id}
                initiative={initiative}
                milestone={m}
                editable={editable}
              />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function MilestoneTasks({
  initiative,
  milestone,
  editable,
}: {
  initiative: InitiativeDetail;
  milestone: Milestone;
  editable: boolean;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section aria-label={milestone.title}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">{milestone.title}</h3>
        {editable && !adding && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAdding(true)}
            aria-label={`Add task to ${milestone.title}`}
          >
            <Plus aria-hidden="true" />
            Add task
          </Button>
        )}
      </div>
      {milestone.tasks.length > 0 && (
        <ul className="mt-2 divide-y divide-border rounded-md border border-border">
          {milestone.tasks.map((task) => (
            <TaskRow
              key={task.id}
              initiative={initiative}
              task={task}
              editable={editable}
            />
          ))}
        </ul>
      )}
      {milestone.tasks.length === 0 && !adding && (
        <p className="mt-1 text-xs text-ink-muted">No tasks yet.</p>
      )}
      {adding && (
        <AddTaskForm
          initiative={initiative}
          milestone={milestone}
          onDone={() => setAdding(false)}
        />
      )}
    </section>
  );
}

function TaskRow({
  initiative,
  task,
  editable,
}: {
  initiative: InitiativeDetail;
  task: Task;
  editable: boolean;
}) {
  const apply = useApplyDetail(initiative.id);
  const update = useApiMutation('updateTask', { onSuccess: apply });
  const remove = useApiMutation('deleteTask', { onSuccess: apply });
  const error = update.error ?? remove.error;

  return (
    <li className="flex flex-col gap-1 px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span
            className={
              task.status === 'DONE'
                ? 'block text-ink-muted line-through'
                : 'block text-ink'
            }
          >
            {task.title}
          </span>
          <span className="block text-xs text-ink-muted">
            {task.assignee?.jobTitle ?? task.assignee?.name ?? 'Unassigned'}
            {task.dueDate && ` · due ${formatDate(task.dueDate)}`}
          </span>
        </span>
        {editable ? (
          <span className="flex shrink-0 items-center gap-1">
            <Select
              aria-label={`Status of ${task.title}`}
              value={task.status}
              disabled={update.isPending}
              onChange={(event) =>
                update.mutate({
                  params: { id: task.id },
                  body: { status: event.target.value as TaskStatus },
                })
              }
              className="h-8 w-auto"
            >
              {Object.values(TaskStatus).map((s) => (
                <option key={s} value={s}>
                  {STATUS_WORDS[s]}
                </option>
              ))}
            </Select>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove task ${task.title}`}
              loading={remove.isPending}
              onClick={() => remove.mutate({ params: { id: task.id } })}
            >
              {!remove.isPending && <Trash2 />}
            </Button>
          </span>
        ) : (
          <Badge tone={STATUS_TONE[task.status]}>
            {STATUS_WORDS[task.status]}
          </Badge>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {errorMessage(error)}
        </p>
      )}
    </li>
  );
}

function AddTaskForm({
  initiative,
  milestone,
  onDone,
}: {
  initiative: InitiativeDetail;
  milestone: Milestone;
  onDone: () => void;
}) {
  const apply = useApplyDetail(initiative.id);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof createTaskSchema>, unknown, CreateTaskInput>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: { title: '', assigneeId: null, dueDate: null },
  });
  const add = useApiMutation('addTask', {
    onSuccess: async (detail) => {
      await apply(detail);
      onDone();
    },
  });
  const onSubmit = handleSubmit((body) =>
    add.mutate({ params: { id: milestone.id }, body }),
  );

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-label={`New task for ${milestone.title}`}
      className="mt-2 flex flex-col gap-3 rounded-md border border-dashed border-border-strong p-3"
    >
      {add.error && <Alert tone="danger">{errorMessage(add.error)}</Alert>}
      <Field label="Task" error={errors.title?.message} required>
        {(c) => <Input {...c} {...register('title')} />}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Controller
          control={control}
          name="assigneeId"
          render={({ field }) => (
            <PeoplePicker
              label="Assignee"
              value={field.value ?? null}
              onChange={field.onChange}
            />
          )}
        />
        <Field label="Due" error={errors.dueDate?.message}>
          {(c) => (
            <Input
              {...c}
              type="date"
              {...register('dueDate', {
                setValueAs: (v: unknown) => (v === '' ? null : v),
              })}
            />
          )}
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={add.isPending}>
          Add task
        </Button>
      </div>
    </form>
  );
}
