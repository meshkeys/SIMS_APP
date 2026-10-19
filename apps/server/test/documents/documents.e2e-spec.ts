import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { emailFor } from '../../prisma/seed/demo/people.js';
import { CLOCK, FixedClock } from '../../src/common/clock/clock.js';
import { createAdminPool } from '../setup/admin-db.js';
import { createTestApp } from '../setup/create-app.js';
import { loadDemo, signInAs } from '../setup/demo.js';

const AMARA = emailFor('strategyHead'); // Strategy Office
const HASSAN = emailFor('headDigital'); // owns DIG-004
const OLU = emailFor('headCompliance'); // can see DIG-004, not accountable for it

const DEMO_NOW = new Date('2026-10-16T09:00:00Z');
const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\ntrailer\n%%EOF\n');

interface Doc {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: { name: string } | null;
  reviewed: boolean;
  can: { delete: boolean };
}

describe('Documents and evidence (e2e)', () => {
  let app: NestExpressApplication;
  let admin: pg.Pool;
  let token: ReturnType<typeof signInAs>;
  const milestones: Record<string, string> = {};
  let october: string;
  let dig004: string;
  const http = () => request(app.getHttpServer());

  /** A request builder already signed in as someone. */
  const as_ = async (who: string) => {
    const bearer = await token(who);
    const server = http();
    return {
      get: (url: string) => server.get(url).auth(bearer, { type: 'bearer' }),
      post: (url: string) => server.post(url).auth(bearer, { type: 'bearer' }),
      delete: (url: string) =>
        server.delete(url).auth(bearer, { type: 'bearer' }),
    };
  };
  const upload = async (
    as: string,
    milestone: string,
    content: Buffer,
    fileName: string,
  ) =>
    (await as_(as))
      .post(`/api/v1/milestones/${milestones[milestone]}/documents`)
      .attach('file', content, fileName);
  const list = async (as: string, milestone: string) =>
    (
      await (
        await as_(as)
      ).get(`/api/v1/milestones/${milestones[milestone]}/documents`)
    ).body as Doc[];
  const testing = 'DIG-004:Testing and deployment';

  beforeAll(async () => {
    admin = createAdminPool();
    await loadDemo(admin);
    app = await createTestApp({
      overrides: [{ provide: CLOCK, useValue: new FixedClock(DEMO_NOW) }],
    });
    token = signInAs(app);
    const rows = await admin.query(
      `SELECT i.code || ':' || m.title AS key, m.id FROM "Milestone" m JOIN "Initiative" i ON i.id = m."initiativeId"`,
    );
    for (const row of rows.rows) milestones[row.key] = row.id;
    october = (
      await admin.query(
        `SELECT id FROM "ReportingPeriod" WHERE name = 'October 2026'`,
      )
    ).rows[0].id;
    dig004 = (
      await admin.query(`SELECT id FROM "Initiative" WHERE code = 'DIG-004'`)
    ).rows[0].id;
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  describe('uploading evidence', () => {
    it('lets the initiative owner attach a file to a milestone', async () => {
      const response = await upload(
        HASSAN,
        testing,
        PDF,
        'UAT log week 41.pdf',
      );

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        fileName: 'UAT log week 41.pdf',
        mimeType: 'application/pdf',
        sizeBytes: PDF.length,
        uploadedBy: { name: expect.any(String) },
        reviewed: false,
        can: { delete: true },
      });
      const stored = await admin.query(
        `SELECT checksum, "storageKey" FROM "Document" WHERE id = $1`,
        [response.body.id],
      );
      expect(stored.rows[0].checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(stored.rows[0].storageKey).toMatch(
        new RegExp(`/Milestone/${milestones[testing]}/${response.body.id}$`),
      );
      const audit = await admin.query(
        `SELECT action FROM "AuditEvent" WHERE "entityId" = $1 AND action = 'EVIDENCE_UPLOADED'`,
        [milestones[testing]],
      );
      expect(audit.rowCount).toBe(1);
    });

    it('counts it as this period’s evidence on the update form and in the review queue', async () => {
      const form = await (
        await as_(HASSAN)
      ).get(`/api/v1/periods/${october}/updates/${dig004}`);
      const line = form.body.lines.find(
        (l: { title: string }) => l.title === 'Testing and deployment',
      );
      expect(line).toMatchObject({ evidenceCount: 1, needsEvidence: false });
      expect(line.evidence[0].fileName).toBe('UAT log week 41.pdf');
      // Evidence from earlier periods does not count for this update.
      expect(
        form.body.lines.find(
          (l: { title: string }) => l.title === 'Business case approved',
        ),
      ).toMatchObject({ evidenceCount: 0, evidence: [] });

      const queue = await (
        await as_(AMARA)
      ).get(`/api/v1/periods/${october}/updates`);
      expect(
        queue.body.find((u: { code: string }) => u.code === 'DIG-004')
          .evidenceFlags,
      ).toBe(0);
    });

    it('lists a milestone’s evidence, newest first, for anyone who can see it', async () => {
      const docs = await list(OLU, 'DIG-004:Business case approved');
      expect(docs.map((d) => d.fileName).sort()).toEqual([
        'DIG-004 business case v2.pdf',
        'EXCO approval minute.pdf',
      ]);
      expect(docs.every((d) => d.reviewed && !d.can.delete)).toBe(true);
    });

    it('refuses files whose type or content is not allowed', async () => {
      const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]);
      const renamed = await upload(HASSAN, testing, exe, 'report.pdf');
      expect(renamed.status).toBe(415);
      expect(renamed.body).toMatchObject({
        code: 'FILE_CONTENT_MISMATCH',
        detail: 'report.pdf does not look like a PDF file.',
      });

      const executable = await upload(HASSAN, testing, exe, 'setup.exe');
      expect(executable.status).toBe(415);
      expect(executable.body.code).toBe('FILE_TYPE_NOT_ALLOWED');
    });

    it('refuses files over the size limit while they stream in', async () => {
      // The test environment allows 1 MB.
      const big = Buffer.concat([PDF, Buffer.alloc(1_200_000, 0x20)]);
      const response = await upload(HASSAN, testing, big, 'scan.pdf');
      expect(response.status).toBe(413);
      expect(response.body).toMatchObject({
        code: 'FILE_TOO_LARGE',
        detail: 'Files can be up to 1 MB.',
      });
    });

    it('asks for a file when none is sent', async () => {
      const response = await (
        await as_(HASSAN)
      )
        .post(`/api/v1/milestones/${milestones[testing]}/documents`)
        .field('note', 'forgot the file');
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('FILE_REQUIRED');
    });

    it('keeps uploads to people accountable for the initiative', async () => {
      const response = await upload(OLU, testing, PDF, 'mine.pdf');
      expect(response.status).toBe(403);
      expect(await list(OLU, testing)).toHaveLength(1);
    });
  });

  describe('downloading and removing', () => {
    it('serves the file as an attachment with its name and type', async () => {
      const [doc] = await list(OLU, testing);
      const response = await (
        await as_(OLU)
      )
        .get(`/api/v1/documents/${doc!.id}/download`)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        });

      expect(response.status).toBe(200);
      expect(Buffer.compare(response.body as Buffer, PDF)).toBe(0);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toBe(
        `attachment; filename="UAT log week 41.pdf"; filename*=UTF-8''UAT%20log%20week%2041.pdf`,
      );
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['cache-control']).toBe('private, no-store');
    });

    it('says so when a listed file is no longer stored', async () => {
      // The demo data lists files without storing them.
      const [doc] = await list(AMARA, 'DIG-004:Technology development');
      const response = await (
        await as_(AMARA)
      ).get(`/api/v1/documents/${doc!.id}/download`);
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('DOCUMENT_FILE_MISSING');
    });

    it('keeps reviewed evidence on record', async () => {
      const [reviewed] = await list(AMARA, 'DIG-004:Business case approved');
      const response = await (
        await as_(AMARA)
      ).delete(`/api/v1/documents/${reviewed!.id}`);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('DOCUMENT_REVIEWED');
    });

    it('lets only the uploader or the Strategy Office remove a file', async () => {
      const [doc] = await list(HASSAN, testing);
      const denied = await (
        await as_(OLU)
      ).delete(`/api/v1/documents/${doc!.id}`);
      expect(denied.status).toBe(403);

      const removed = await (
        await as_(HASSAN)
      ).delete(`/api/v1/documents/${doc!.id}`);
      expect(removed.status).toBe(204);
      expect(await list(HASSAN, testing)).toEqual([]);
      const gone = await (
        await as_(HASSAN)
      ).get(`/api/v1/documents/${doc!.id}/download`);
      expect(gone.status).toBe(404);
      // Kept for the audit trail.
      const row = await admin.query(
        `SELECT "deletedAt" FROM "Document" WHERE id = $1`,
        [doc!.id],
      );
      expect(row.rows[0].deletedAt).not.toBeNull();
    });
  });
});
