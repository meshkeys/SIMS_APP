import { Test } from '@nestjs/testing';
import type pg from 'pg';
import { ConfigModule } from '../../src/config/config.module.js';
import {
  DatabaseModule,
  MissingTenantContextError,
  PrismaService,
  TenantContext,
  TenantPrismaService,
} from '../../src/infrastructure/database/index.js';
import { createAdminPool, resetDatabase } from '../setup/admin-db.js';

/**
 * Proves tenant isolation end to end, through the real app role (no
 * superuser, no BYPASSRLS) against a migrated database.
 */

const ORG_A = '0199f0a0-0000-7000-8000-00000000000a';
const ORG_B = '0199f0a0-0000-7000-8000-00000000000b';
const PLAN_A = '0199f0a0-0000-7000-8000-0000000000a1';
const PLAN_B = '0199f0a0-0000-7000-8000-0000000000b1';
const INIT_A = '0199f0a0-0000-7000-8000-0000000000a2';
const INIT_B = '0199f0a0-0000-7000-8000-0000000000b2';

const asOrg = <T>(organisationId: string, fn: () => Promise<T>) =>
  TenantContext.run({ organisationId }, fn);

describe('Tenant isolation (row-level security)', () => {
  let admin: pg.Pool;
  let prisma: PrismaService;
  let db: TenantPrismaService;
  let close: () => Promise<void>;

  beforeAll(async () => {
    admin = createAdminPool();
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, DatabaseModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    db = moduleRef.get(TenantPrismaService);
    close = () => moduleRef.close();
  });

  afterAll(async () => {
    await close();
    await admin.end();
  });

  beforeEach(async () => {
    await resetDatabase(admin);
    await admin.query(
      `INSERT INTO "Organisation" (id, name, slug, sector, country, "updatedAt") VALUES
         ($1, 'Org A', 'org-a', 'PRIVATE', 'NG', now()),
         ($2, 'Org B', 'org-b', 'PUBLIC',  'NG', now())`,
      [ORG_A, ORG_B],
    );
    await admin.query(
      `INSERT INTO "StrategicPlan" (id, "organisationId", name, "startDate", "endDate", "updatedAt") VALUES
         ($1, $2, 'Plan A', '2024-01-01', '2026-12-31', now()),
         ($3, $4, 'Plan B', '2024-01-01', '2026-12-31', now())`,
      [PLAN_A, ORG_A, PLAN_B, ORG_B],
    );
    await admin.query(
      `INSERT INTO "Initiative" (id, "organisationId", "planId", code, title, "updatedAt") VALUES
         ($1, $2, $3, 'DIG-004', 'A: Digital Investment Platform', now()),
         ($4, $5, $6, 'DIG-004', 'B: Same code, other tenant',     now())`,
      [INIT_A, ORG_A, PLAN_A, INIT_B, ORG_B, PLAN_B],
    );
  });

  describe('reads', () => {
    it('returns only the current organisation’s rows', async () => {
      const titles = await asOrg(ORG_A, () =>
        db.client.initiative.findMany({ select: { title: true } }),
      );

      expect(titles).toEqual([{ title: 'A: Digital Investment Platform' }]);
    });

    it('cannot fetch another tenant’s row even by its exact id', async () => {
      const found = await asOrg(ORG_A, () =>
        db.client.initiative.findUnique({ where: { id: INIT_B } }),
      );

      expect(found).toBeNull();
    });

    it('scopes the Organisation table to the tenant itself', async () => {
      const orgs = await asOrg(ORG_B, () =>
        db.client.organisation.findMany({ select: { id: true } }),
      );

      expect(orgs).toEqual([{ id: ORG_B }]);
    });

    it('keeps concurrent requests for different tenants apart', async () => {
      const titleFor = (org: string) =>
        asOrg(org, async () => {
          const rows = await db.client.initiative.findMany({
            select: { title: true },
          });
          return rows.map((row) => row.title);
        });

      const results = await Promise.all([
        titleFor(ORG_A),
        titleFor(ORG_B),
        titleFor(ORG_A),
        titleFor(ORG_B),
      ]);

      expect(results).toEqual([
        ['A: Digital Investment Platform'],
        ['B: Same code, other tenant'],
        ['A: Digital Investment Platform'],
        ['B: Same code, other tenant'],
      ]);
    });
  });

  describe('writes', () => {
    it('silently matches nothing when updating another tenant’s rows', async () => {
      const { count } = await asOrg(ORG_A, () =>
        db.client.initiative.updateMany({
          where: { id: INIT_B },
          data: { title: 'hijacked' },
        }),
      );

      expect(count).toBe(0);
      const { rows } = await admin.query(
        `SELECT title FROM "Initiative" WHERE id = $1`,
        [INIT_B],
      );
      expect(rows[0].title).toBe('B: Same code, other tenant');
    });

    it('rejects inserting a row into another tenant', async () => {
      await expect(
        asOrg(ORG_A, () =>
          db.client.department.create({
            data: { organisationId: ORG_B, name: 'Planted' },
          }),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  describe('fail-closed behaviour', () => {
    it('refuses tenant-scoped access outside a tenant context', async () => {
      await expect(db.client.initiative.findMany()).rejects.toBeInstanceOf(
        MissingTenantContextError,
      );
      await expect(db.transaction(async () => 1)).rejects.toBeInstanceOf(
        MissingTenantContextError,
      );
    });

    it('returns no rows through the raw client, which sets no tenant', async () => {
      await expect(prisma.initiative.findMany()).resolves.toEqual([]);
    });

    it('does not leak the tenant setting onto pooled connections', async () => {
      await asOrg(ORG_A, () => db.client.initiative.findMany());

      await expect(prisma.initiative.count()).resolves.toBe(0);
    });
  });

  describe('interactive transactions', () => {
    it('applies the tenant to every statement, including raw SQL', async () => {
      const count = await asOrg(ORG_B, () =>
        db.transaction(async (tx) => {
          const rows = await tx.$queryRaw<{ count: bigint }[]>`
            SELECT count(*) AS count FROM "Initiative"`;
          return Number(rows[0].count);
        }),
      );

      expect(count).toBe(1);
    });

    it('rolls back every write when one fails', async () => {
      await expect(
        asOrg(ORG_A, () =>
          db.transaction(async (tx) => {
            await tx.department.create({
              data: { organisationId: ORG_A, name: 'Finance' },
            });
            await tx.department.create({
              data: { organisationId: ORG_A, name: 'Finance' }, // duplicate name
            });
          }),
        ),
      ).rejects.toThrow();

      const { rows } = await admin.query(
        `SELECT count(*)::int AS n FROM "Department"`,
      );
      expect(rows[0].n).toBe(0);
    });
  });

  describe('audit trail', () => {
    it('is append-only for the application role', async () => {
      const event = await asOrg(ORG_A, () =>
        db.client.auditEvent.create({
          data: {
            organisationId: ORG_A,
            action: 'STATUS_OVERRIDE',
            entityType: 'Initiative',
            entityId: INIT_A,
          },
        }),
      );

      await expect(
        asOrg(ORG_A, () =>
          db.client.auditEvent.update({
            where: { id: event.id },
            data: { action: 'TAMPERED' },
          }),
        ),
      ).rejects.toThrow(/permission denied/i);

      await expect(
        asOrg(ORG_A, () =>
          db.client.auditEvent.delete({ where: { id: event.id } }),
        ),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  describe('database integrity rules', () => {
    it('rejects a milestone weight above 100%', async () => {
      await expect(
        asOrg(ORG_A, () =>
          db.client.milestone.create({
            data: {
              organisationId: ORG_A,
              initiativeId: INIT_A,
              title: 'Over-weighted',
              weight: 150,
              baselineDate: new Date('2026-10-31'),
            },
          }),
        ),
      ).rejects.toThrow(/Milestone_weight_check/);
    });

    it('allows only one ACTIVE ruleset per organisation', async () => {
      const ruleset = (version: number) =>
        db.client.ruleset.create({
          data: {
            organisationId: ORG_A,
            version,
            status: 'ACTIVE',
            config: {},
          },
        });

      await asOrg(ORG_A, () => ruleset(1));
      await expect(asOrg(ORG_A, () => ruleset(2))).rejects.toThrow();
    });

    it('requires a reason, author and expiry for a health override', async () => {
      await expect(
        asOrg(ORG_A, () =>
          db.client.initiative.update({
            where: { id: INIT_A },
            data: { healthOverride: 'AMBER' },
          }),
        ),
      ).rejects.toThrow(/Initiative_override_complete_check/);
    });
  });

  describe('catalog guards', () => {
    it('enforces RLS on every table that has an organisationId column', async () => {
      const { rows } = await admin.query<{ table: string }>(`
        SELECT c.relname AS table
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND a.attname = 'organisationId' AND NOT a.attisdropped
          AND NOT (
            c.relrowsecurity AND c.relforcerowsecurity
            AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
          )
      `);

      // A failure here means a migration added a tenant table without
      // `SELECT sims_enable_tenant_rls('"Table"');`
      expect(rows.map((row) => row.table)).toEqual([]);
    });

    it('connects as a role that cannot bypass row-level security', async () => {
      const [role] = await prisma.$queryRaw<
        { rolsuper: boolean; rolbypassrls: boolean; owns_tables: boolean }[]
      >`
        SELECT r.rolsuper, r.rolbypassrls,
               EXISTS (SELECT 1 FROM pg_tables t
                       WHERE t.schemaname = 'public' AND t.tableowner = r.rolname) AS owns_tables
        FROM pg_roles r WHERE r.rolname = current_user`;

      expect(role).toEqual({
        rolsuper: false,
        rolbypassrls: false,
        owns_tables: false,
      });
    });
  });
});
