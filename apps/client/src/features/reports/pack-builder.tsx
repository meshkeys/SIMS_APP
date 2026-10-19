import {
  REPORT_AUDIENCES,
  REPORT_FORMATS,
  REPORT_SECTIONS,
  REPORT_TEMPLATE_KEYS,
  REPORT_TEMPLATES,
  type PackContent,
  type ReportAudience,
  type ReportFormatKey,
  type ReportSectionKey,
  type ReportSnapshot,
  type ReportTemplateKey,
} from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useSession } from '@/auth/use-auth';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Select, Textarea } from '@/components/ui/form';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { errorMessage } from '@/lib/api/errors';
import { useApiMutation, useApiQuery } from '@/lib/api/query';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';
import { FORMAT_LABEL, snapshotLabel } from './labels';
import { previewPages } from './pack-pages';
import { PackPreview } from './pack-preview';

const defaultsFor = (template: ReportTemplateKey) =>
  new Set(
    REPORT_TEMPLATES[template].sections
      .filter((s) => s.checked)
      .map((s) => s.key),
  );

/**
 * The board pack builder: template, snapshot and audience, sections,
 * narrative and formats, with a page-by-page preview of exactly what the
 * files will contain. The server assembles the content; the screen shows the
 * sections that are ticked.
 */
export function PackBuilder({ snapshots }: { snapshots: ReportSnapshot[] }) {
  const { organisation } = useSession();
  const queryClient = useQueryClient();
  const usable = snapshots.filter((s) => s.usable);
  const [template, setTemplate] =
    useState<ReportTemplateKey>('QUARTERLY_BOARD');
  const [snapshotId, setSnapshotId] = useState(usable[0]?.id ?? '');
  const [audience, setAudience] = useState<ReportAudience>(
    REPORT_TEMPLATES.QUARTERLY_BOARD.defaultAudience,
  );
  const snapshot = usable.find((s) => s.id === snapshotId);
  const [pillarId, setPillarId] = useState(snapshot?.pillars[0]?.id ?? '');
  const [sections, setSections] = useState(() =>
    defaultsFor('QUARTERLY_BOARD'),
  );
  const [narrative, setNarrative] = useState('');
  const [formats, setFormats] = useState<Set<ReportFormatKey>>(
    () => new Set(['PDF', 'PPTX']),
  );
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const config = REPORT_TEMPLATES[template];
  const offered = config.sections.map((s) => s.key);
  const scopeElementId = config.needsPillar ? pillarId || null : null;

  // Every offered section, so each checkbox can show its page count.
  const preview = useApiQuery(
    'previewPack',
    {
      body: {
        snapshotId,
        template,
        audience,
        sections: offered,
        scopeElementId,
        narrative: null,
      },
    },
    {
      enabled: !!snapshotId && (!config.needsPillar || !!pillarId),
      placeholderData: (previous) => previous,
    },
  );

  const pagesOf = (key: ReportSectionKey) =>
    preview.data?.sections.find((s) => s.key === key)?.pages;
  const content = useMemo((): PackContent | null => {
    if (!preview.data) return null;
    const chosen = preview.data.sections
      .filter((s) => sections.has(s.key))
      .map((s) =>
        s.key === 'executive_summary'
          ? { ...s, narrative: narrative.trim() || null }
          : s,
      );
    return {
      ...preview.data,
      sections: chosen,
      pageCount: 1 + chosen.reduce((n, s) => n + s.pages, 0),
    };
  }, [preview.data, sections, narrative]);
  const currency =
    (
      preview.data?.sections.find((s) => s.key === 'benefits') as
        { currency: string } | undefined
    )?.currency ?? organisation.currency;
  const pages = content ? previewPages(content, currency) : [];

  const create = useApiMutation('createPack', {
    onSuccess: async (pack) => {
      setNotice(
        pack.status === 'READY'
          ? `${pack.title} is ready to download below.`
          : `${pack.title} is being generated. It appears below when ready.`,
      );
      await queryClient.invalidateQueries({ queryKey: ['listPacks'] });
    },
  });

  const chooseTemplate = (next: ReportTemplateKey) => {
    setTemplate(next);
    setAudience(REPORT_TEMPLATES[next].defaultAudience);
    setSections(defaultsFor(next));
    setPage(0);
  };
  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const generate = () => {
    setNotice(null);
    create.mutate({
      body: {
        snapshotId,
        template,
        audience,
        sections: offered.filter((key) => sections.has(key)),
        scopeElementId,
        narrative: narrative.trim() || null,
        formats: REPORT_FORMATS.filter((f) => formats.has(f)),
      },
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        {notice && <Alert tone="success">{notice}</Alert>}
        {create.error && (
          <Alert tone="danger" title="The pack was not requested">
            {errorMessage(create.error)}
          </Alert>
        )}

        <Card>
          <CardBody>
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-3 text-base font-semibold text-ink">
                1 · Choose a template
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {REPORT_TEMPLATE_KEYS.map((key) => {
                  const t = REPORT_TEMPLATES[key];
                  const selected = key === template;
                  return (
                    <label
                      key={key}
                      className={cn(
                        'cursor-pointer rounded-md border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary',
                        selected
                          ? 'border-primary bg-primary-soft'
                          : 'border-border hover:border-border-strong',
                      )}
                    >
                      <input
                        type="radio"
                        name="template"
                        className="sr-only"
                        checked={selected}
                        onChange={() => chooseTemplate(key)}
                      />
                      <span className="block font-medium text-ink">
                        {t.name}
                        <span className="sr-only">.</span>
                      </span>{' '}
                      <span className="mt-1 block text-sm text-ink-muted">
                        {t.description}
                        {selected && content && (
                          <span className="sr-only">.</span>
                        )}
                      </span>{' '}
                      {selected && content && (
                        <span className="mt-1 block text-xs text-ink-muted">
                          {plural(content.pageCount, 'page')}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex flex-col gap-4">
            <h2 className="text-base font-semibold text-ink">
              2 · Snapshot & audience
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Reporting snapshot">
                {(c) => (
                  <Select
                    {...c}
                    value={snapshotId}
                    onChange={(e) => {
                      const next = usable.find((s) => s.id === e.target.value);
                      setSnapshotId(e.target.value);
                      setPillarId(next?.pillars[0]?.id ?? '');
                      setPage(0);
                    }}
                  >
                    {usable.map((s) => (
                      <option key={s.id} value={s.id}>
                        {snapshotLabel(s, organisation.timezone)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Audience">
                {(c) => (
                  <Select
                    {...c}
                    value={audience}
                    onChange={(e) =>
                      setAudience(e.target.value as ReportAudience)
                    }
                  >
                    {(Object.keys(REPORT_AUDIENCES) as ReportAudience[]).map(
                      (a) => (
                        <option key={a} value={a}>
                          {REPORT_AUDIENCES[a]}
                        </option>
                      ),
                    )}
                  </Select>
                )}
              </Field>
              {config.needsPillar && snapshot && (
                <Field label="Pillar">
                  {(c) => (
                    <Select
                      {...c}
                      value={pillarId}
                      onChange={(e) => {
                        setPillarId(e.target.value);
                        setPage(0);
                      }}
                    >
                      {snapshot.pillars.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} · {p.title}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}
            </div>
            {content && content.sensitiveSummarised > 0 && (
              <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-ink-muted">
                Sensitive initiatives ({content.sensitiveSummarised}) are
                summarised at pillar level for this audience.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-3 text-base font-semibold text-ink">
                3 · Sections
              </legend>
              <ul className="flex flex-col gap-2">
                {offered.map((key) => {
                  const pagesHere = pagesOf(key);
                  const title =
                    preview.data?.sections.find((s) => s.key === key)?.title ??
                    REPORT_SECTIONS[key];
                  return (
                    <li key={key}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2.5 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={sections.has(key)}
                          onChange={() => {
                            setSections((s) => toggle(s, key));
                            setPage(0);
                          }}
                        />
                        <span className="flex-1 text-ink">
                          {title}
                          {pagesHere !== undefined && (
                            <span className="sr-only">,</span>
                          )}
                        </span>{' '}
                        {pagesHere !== undefined && (
                          <span className="text-xs text-ink-muted">
                            {plural(pagesHere, 'page')}
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex flex-wrap items-center gap-3">
            <fieldset className="m-0 flex flex-wrap items-center gap-2 border-0 p-0">
              <legend className="float-left mr-2 text-base font-semibold text-ink">
                4 · Format
              </legend>
              {REPORT_FORMATS.map((f) => (
                <Button
                  key={f}
                  type="button"
                  variant={formats.has(f) ? 'primary' : 'secondary'}
                  className="rounded-full"
                  aria-pressed={formats.has(f)}
                  onClick={() => setFormats((s) => toggle(s, f))}
                >
                  {FORMAT_LABEL[f]}
                </Button>
              ))}
            </fieldset>
            <Button
              className="ml-auto"
              loading={create.isPending}
              disabled={!content || sections.size === 0 || formats.size === 0}
              onClick={generate}
            >
              Generate pack
            </Button>
          </CardBody>
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <Card aria-labelledby="preview-title">
          <CardBody>
            <h2 id="preview-title" className="text-base font-semibold text-ink">
              Preview
            </h2>
            {preview.isError ? (
              <ErrorState
                error={preview.error}
                onRetry={() => void preview.refetch()}
              />
            ) : !content ? (
              <Skeleton className="mt-3 aspect-[297/210]" />
            ) : (
              <div className="mt-3">
                <PackPreview
                  pages={pages}
                  page={Math.min(page, pages.length - 1)}
                  onPage={setPage}
                  loading={preview.isFetching}
                />
              </div>
            )}
          </CardBody>
        </Card>

        {sections.has('executive_summary') && (
          <Card>
            <CardBody>
              <Field
                label="Executive narrative"
                hint="Opening commentary from the Strategy Office"
              >
                {(c) => (
                  <Textarea
                    {...c}
                    rows={4}
                    maxLength={4000}
                    placeholder="Three to four sentences on overall execution health, the key slippage and the decisions the Board is asked to note."
                    value={narrative}
                    onChange={(e) => setNarrative(e.target.value)}
                  />
                )}
              </Field>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
