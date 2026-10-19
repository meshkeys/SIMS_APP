import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/clock/clock.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { assemblePack } from '../../domain/reports/assemble-pack.js';
import { isPackReady } from '../../domain/reports/snapshot-data.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { recordAudit } from '../../infrastructure/audit/record-audit.js';
import {
  TenantContext,
  TenantPrismaService,
} from '../../infrastructure/database/index.js';
import { JOB_QUEUE, type JobQueue } from '../../infrastructure/jobs/index.js';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from '../../infrastructure/storage/index.js';
import { renderPackHtml } from './render/pack-html.js';
import { renderPackPptx } from './render/pack-pptx.js';
import { renderPackXlsx } from './render/pack-xlsx.js';
import { printPdf } from './render/pdf-printer.js';
import type {
  PackContent,
  PackDefinition,
  ReportFormatKey,
} from '@sims/contracts';

/** File type and extension per format. */
export const PACK_FILES: Record<
  ReportFormatKey,
  { mimeType: string; extension: string }
> = {
  PDF: { mimeType: 'application/pdf', extension: 'pdf' },
  PPTX: {
    mimeType:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extension: 'pptx',
  },
  XLSX: {
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
  },
};

/**
 * Produces a pack's files as a background job: assembles the content from
 * the pack's snapshot (exactly what the preview showed), renders each
 * requested format, stores the files and marks the pack issued. A failure
 * is recorded on the pack, so it can be generated again.
 */
@Injectable()
export class PackGeneratorService implements OnModuleInit {
  constructor(
    private readonly db: TenantPrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
    @Inject(ENV) private readonly env: Env,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  onModuleInit() {
    this.jobs.handle('report-pack.generate', ({ packId }) =>
      this.generate(packId),
    );
  }

  async generate(packId: string): Promise<void> {
    const job = await this.db.transaction(async (tx) => {
      const pack = await tx.reportPack.findUnique({
        where: { id: packId },
        include: { snapshot: { select: { data: true } } },
      });
      if (!pack) return null;
      await tx.reportPack.update({
        where: { id: packId },
        data: { status: 'GENERATING', error: null },
      });
      const organisation = await tx.organisation.findUniqueOrThrow({
        where: { id: TenantContext.require().organisationId },
        select: { name: true },
      });
      return { pack, organisation: organisation.name };
    });
    if (!job) return; // Deleted since it was queued.
    const { pack } = job;

    try {
      const data = pack.snapshot?.data;
      if (!isPackReady(data))
        throw new Error('The pack’s snapshot cannot build packs.');
      const content = assemblePack(
        data,
        {
          template: pack.template,
          audience: pack.audience as PackDefinition['audience'],
          sections: pack.sections as PackDefinition['sections'],
          scopeElementId: pack.scopeElementId,
          narrative: pack.narrative,
        },
        { organisation: job.organisation, title: pack.title },
      );

      const { organisationId } = TenantContext.require();
      const fileKeys: Partial<Record<ReportFormatKey, string>> = {};
      for (const format of pack.formats) {
        const file = PACK_FILES[format];
        const key = `${organisationId}/ReportPack/${pack.id}/v${pack.version}.${file.extension}`;
        await this.storage.put(
          key,
          await this.render(format, content),
          file.mimeType,
        );
        fileKeys[format] = key;
      }

      await this.db.transaction(async (tx) => {
        await tx.reportPack.update({
          where: { id: packId },
          data: {
            status: 'READY',
            fileKeys: fileKeys as Prisma.InputJsonValue,
            issuedAt: this.clock.now(),
            error: null,
          },
        });
        await recordAudit(tx, {
          action: 'REPORT_PACK_ISSUED',
          entityType: 'ReportPack',
          entityId: packId,
          after: {
            title: pack.title,
            version: pack.version,
            formats: pack.formats,
            pages: content.pageCount,
          },
        });
      });
    } catch (error) {
      const message = (error as Error).message.slice(0, 500);
      await this.db.transaction(async (tx) => {
        await tx.reportPack.update({
          where: { id: packId },
          data: { status: 'FAILED', error: message },
        });
        await recordAudit(tx, {
          action: 'REPORT_PACK_FAILED',
          entityType: 'ReportPack',
          entityId: packId,
          after: { error: message },
        });
      });
      throw error;
    }
  }

  private render(
    format: ReportFormatKey,
    content: PackContent,
  ): Promise<Buffer> {
    if (format === 'PDF')
      return printPdf(renderPackHtml(content), this.env.CHROME_PATH);
    if (format === 'PPTX') return renderPackPptx(content);
    return renderPackXlsx(content);
  }
}
