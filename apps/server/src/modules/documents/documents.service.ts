import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/clock/clock.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { uuidv7 } from '../../common/ids/uuidv7.js';
import { canSeeInitiative } from '../../domain/access/initiative-visibility.js';
import { checkUpload } from '../../domain/documents/upload-rules.js';
import { recordAudit } from '../../infrastructure/audit/record-audit.js';
import {
  TenantContext,
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../infrastructure/database/index.js';
import {
  documentKey,
  OBJECT_STORAGE,
  ObjectNotFoundError,
  type ObjectStorage,
} from '../../infrastructure/storage/index.js';
import type { AuthContext } from '../auth/index.js';
import { loadForWrite } from '../delivery/write-access.js';
import {
  canDeleteDocument,
  documentSelect,
  toDocumentViews,
} from './document-view.js';
import type { DocumentView } from '@sims/contracts';

const MB = 1_048_576;

const milestoneNotFound = () =>
  new NotFoundException({
    code: 'MILESTONE_NOT_FOUND',
    message: 'Milestone not found.',
  });
const documentNotFound = () =>
  new NotFoundException({
    code: 'DOCUMENT_NOT_FOUND',
    message: 'Document not found.',
  });

const initiativeAccess = {
  select: {
    id: true,
    isSensitive: true,
    ownerId: true,
    sponsorId: true,
    benefitsOwnerId: true,
  },
} as const;

/** An uploaded file as handed over by the upload interceptor. */
export interface IncomingFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

/** A download ready to stream. */
export interface DocumentDownload {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  stream: Readable;
}

/**
 * Evidence files on milestones. Bytes live in object storage under a key the
 * server builds; rows hold the metadata, a SHA-256 checksum and who uploaded
 * and reviewed them. Every read and write checks the initiative's
 * visibility and accountability first.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly db: TenantPrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(ENV) private readonly env: Env,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async listForMilestone(
    viewer: AuthContext,
    milestoneId: string,
  ): Promise<DocumentView[]> {
    return this.db.transaction(async (tx) => {
      await this.visibleMilestone(tx, viewer, milestoneId);
      const rows = await tx.document.findMany({
        where: {
          entityType: 'Milestone',
          entityId: milestoneId,
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        select: documentSelect,
      });
      return toDocumentViews(tx, rows, viewer);
    });
  }

  /** The initiative's owner or sponsor, or the Strategy Office. */
  async uploadToMilestone(
    caller: AuthContext,
    milestoneId: string,
    file: IncomingFile | undefined,
  ): Promise<DocumentView> {
    if (!file) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'Choose a file to upload (form field "file").',
      });
    }
    // Check access before storing anything.
    await this.db.transaction(async (tx) => {
      const milestone = await this.visibleMilestone(tx, caller, milestoneId);
      await loadForWrite(tx, caller, milestone.initiative.id);
    });

    const check = checkUpload(
      {
        originalName: file.originalname,
        size: file.size,
        head: file.buffer.subarray(0, 4096),
      },
      this.env.UPLOAD_MAX_MB * MB,
    );
    if (!check.ok) {
      const body = { code: check.code, message: check.message };
      throw check.code === 'FILE_TOO_LARGE'
        ? new PayloadTooLargeException(body)
        : check.code === 'FILE_EMPTY'
          ? new BadRequestException(body)
          : new UnsupportedMediaTypeException(body);
    }

    const { organisationId } = TenantContext.require();
    const id = uuidv7();
    const storageKey = documentKey(
      organisationId,
      'Milestone',
      milestoneId,
      id,
    );
    await this.storage.put(storageKey, file.buffer, check.mimeType);
    try {
      return await this.db.transaction(async (tx) => {
        await tx.document.create({
          data: {
            id,
            organisationId,
            entityType: 'Milestone',
            entityId: milestoneId,
            fileName: check.fileName,
            storageKey,
            mimeType: check.mimeType,
            sizeBytes: file.size,
            checksum: createHash('sha256').update(file.buffer).digest('hex'),
            uploadedById: caller.membershipId,
          },
        });
        await recordAudit(tx, {
          action: 'EVIDENCE_UPLOADED',
          entityType: 'Milestone',
          entityId: milestoneId,
          after: {
            documentId: id,
            fileName: check.fileName,
            sizeBytes: file.size,
          },
        });
        const row = await tx.document.findUniqueOrThrow({
          where: { id },
          select: documentSelect,
        });
        return (await toDocumentViews(tx, [row], caller))[0]!;
      });
    } catch (error) {
      // Never leave bytes behind without their row.
      await this.storage.delete(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async download(
    viewer: AuthContext,
    documentId: string,
  ): Promise<DocumentDownload> {
    const document = await this.db.transaction((tx) =>
      this.visibleDocument(tx, viewer, documentId),
    );
    try {
      return {
        fileName: document.fileName,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        stream: await this.storage.get(document.storageKey),
      };
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        throw new NotFoundException({
          code: 'DOCUMENT_FILE_MISSING',
          message: `${document.fileName} is listed but its file is no longer stored.`,
        });
      }
      throw error;
    }
  }

  /**
   * Removes a document from lists and evidence counts. The row (and the file,
   * until a clean-up job purges it) stays for the audit trail.
   */
  async remove(caller: AuthContext, documentId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const document = await this.visibleDocument(tx, caller, documentId);
      if (document.reviewedAt) {
        throw new ConflictException({
          code: 'DOCUMENT_REVIEWED',
          message: `${document.fileName} was reviewed with a verified update, so it stays on record.`,
        });
      }
      if (!canDeleteDocument(caller, document)) {
        throw new ForbiddenException({
          code: 'NOT_UPLOADER',
          message:
            'Only whoever uploaded it, or the Strategy Office, can remove a document.',
        });
      }
      await tx.document.update({
        where: { id: documentId },
        data: { deletedAt: this.clock.now() },
      });
      await recordAudit(tx, {
        action: 'EVIDENCE_REMOVED',
        entityType: document.entityType,
        entityId: document.entityId,
        before: { documentId, fileName: document.fileName },
      });
    });
  }

  // ---------------------------------------------------------------------------

  private async visibleMilestone(
    tx: TenantTransactionClient,
    viewer: AuthContext,
    milestoneId: string,
  ) {
    const milestone = await tx.milestone.findUnique({
      where: { id: milestoneId },
      select: { id: true, initiative: initiativeAccess },
    });
    if (!milestone || !canSeeInitiative(viewer, milestone.initiative))
      throw milestoneNotFound();
    return milestone;
  }

  /** A live document on something the viewer may see (only milestones hold documents so far). */
  private async visibleDocument(
    tx: TenantTransactionClient,
    viewer: AuthContext,
    documentId: string,
  ) {
    const document = await tx.document.findFirst({
      where: { id: documentId, deletedAt: null },
    });
    if (!document || document.entityType !== 'Milestone')
      throw documentNotFound();
    const milestone = await tx.milestone.findUnique({
      where: { id: document.entityId },
      select: { initiative: initiativeAccess },
    });
    if (!milestone || !canSeeInitiative(viewer, milestone.initiative))
      throw documentNotFound();
    return document;
  }
}
