import {
  type DocumentView,
  EVIDENCE_EXTENSIONS,
  type UpdateForm,
} from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, Paperclip, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { download, request, upload } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { apiKey } from '@/lib/api/query';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { saveFile } from '@/lib/save-file';

type Line = UpdateForm['lines'][number];

const ACCEPT = EVIDENCE_EXTENSIONS.map((e) => `.${e}`).join(',');

/**
 * The evidence column of a milestone line: its status, this period's files
 * (click to download), and, for people editing the update, upload and
 * remove. After a change the form is re-read, so counts and the checklist
 * follow at once.
 */
export function EvidenceCell({
  form,
  line,
  needsEvidence,
  canUpload,
}: {
  form: UpdateForm;
  line: Line;
  needsEvidence: boolean;
  canUpload: boolean;
}) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [busy, setBusy] = useState<'upload' | string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: apiKey('getUpdate', {
        params: { periodId: form.period.id, initiativeId: form.initiative.id },
      }),
    });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy('upload');
    setError(null);
    try {
      await upload(
        'uploadMilestoneDocument',
        { params: { id: line.milestoneId } },
        file,
      );
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async (doc: DocumentView) => {
    setBusy(doc.id);
    setError(null);
    try {
      await request('deleteDocument', { params: { id: doc.id } });
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const open = async (doc: DocumentView) => {
    setError(null);
    try {
      const file = await download('downloadDocument', {
        params: { id: doc.id },
      });
      saveFile(file.blob, file.fileName);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const status = line.locked ? (
    <span className="text-ink-muted">Verified · locked</span>
  ) : line.evidence.length > 0 ? (
    <span className="text-ink-muted">
      {line.evidence.length} file{line.evidence.length === 1 ? '' : 's'}{' '}
      uploaded
    </span>
  ) : needsEvidence ? (
    <span className="font-medium text-danger">
      {canUpload ? 'Upload required' : 'Missing'}
    </span>
  ) : !canUpload ? (
    <span className="text-ink-muted">—</span>
  ) : line.evidenceRequired ? (
    <span className="text-ink-muted">If progress is claimed</span>
  ) : (
    <span className="text-ink-muted">Not required</span>
  );

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      {status}
      {line.evidence.length > 0 && (
        <ul
          aria-label={`Evidence for ${line.title}`}
          className="flex flex-col gap-1"
        >
          {line.evidence.map((doc) => (
            <li key={doc.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void open(doc)}
                className="flex min-w-0 items-center gap-1 text-left text-primary underline-offset-2 hover:underline"
                title={`${doc.fileName} · ${formatBytes(doc.sizeBytes)}`}
              >
                <FileText aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">{doc.fileName}</span>
                <span className="sr-only">
                  , {formatBytes(doc.sizeBytes)}
                  {doc.reviewed ? ', reviewed' : ''} (download)
                </span>
              </button>
              {canUpload && doc.can.delete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  aria-label={`Remove ${doc.fileName}`}
                  loading={busy === doc.id}
                  disabled={busy !== null}
                  onClick={() => void remove(doc)}
                >
                  <X />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canUpload && !line.locked && (
        <>
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button
            variant={needsEvidence ? 'secondary' : 'ghost'}
            size="sm"
            className={cn(
              'h-7 self-start px-2 text-xs',
              needsEvidence && 'border-danger',
            )}
            loading={busy === 'upload'}
            disabled={busy !== null}
            aria-describedby={error ? errorId : undefined}
            onClick={() => input.current?.click()}
          >
            <Paperclip />
            Upload<span className="sr-only"> evidence for {line.title}</span>
          </Button>
        </>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
