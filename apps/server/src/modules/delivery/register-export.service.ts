import { Inject, Injectable } from '@nestjs/common';
import type { RegisterExportQuery, RegisterItem } from '@sims/contracts';
import { CLOCK, type Clock } from '../../common/clock/clock.js';
import { TenantPrismaService } from '../../infrastructure/database/index.js';
import type { AuthContext } from '../auth/index.js';
import { InitiativeRegisterService } from './initiative-register.service.js';
import { buildRegisterWorkbook } from './register-workbook.js';

/** Rows per register query while collecting the export. */
const BATCH = 500;
/** A spreadsheet beyond this is not a register any more; filter first. */
export const EXPORT_LIMIT = 10_000;

const HEALTH_WORDS = {
  GREEN: 'On track',
  AMBER: 'At risk',
  RED: 'Delayed',
  UNKNOWN: 'Unknown',
} as const;

/**
 * The register as an Excel file. It runs the register's own query page by
 * page, so filters, order and visibility (restricted initiatives) are exactly
 * what the person sees on screen.
 */
@Injectable()
export class RegisterExportService {
  constructor(
    private readonly register: InitiativeRegisterService,
    private readonly db: TenantPrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async export(
    viewer: AuthContext,
    query: RegisterExportQuery,
  ): Promise<{ fileName: string; content: Buffer }> {
    const items: RegisterItem[] = [];
    let total = 0;
    for (let page = 1; items.length < EXPORT_LIMIT; page += 1) {
      const result = await this.register.list(viewer, {
        ...query,
        page,
        pageSize: BATCH,
      });
      total = result.total;
      items.push(...result.items);
      if (page >= result.totalPages) break;
    }
    const rows = items.slice(0, EXPORT_LIMIT);

    const [organisation, me, element, department] = await Promise.all([
      this.db.client.organisation.findFirstOrThrow({
        select: { name: true, timezone: true },
      }),
      this.db.client.membership.findUniqueOrThrow({
        where: { id: viewer.membershipId },
        select: { user: { select: { name: true } } },
      }),
      query.elementId
        ? this.db.client.strategyElement.findUnique({
            where: { id: query.elementId },
            select: { title: true },
          })
        : null,
      query.departmentId
        ? this.db.client.department.findUnique({
            where: { id: query.departmentId },
            select: { name: true },
          })
        : null,
    ]);
    const now = this.clock.now();
    const local = (options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: organisation.timezone,
        ...options,
      }).format(now);

    const content = await buildRegisterWorkbook(rows, {
      organisation: organisation.name,
      exportedBy: me.user.name,
      exportedAt: local({ dateStyle: 'long', timeStyle: 'short' }),
      filters: describeFilters(query, {
        element: element?.title,
        department: department?.name,
      }),
      total,
      truncated: total > rows.length,
    });
    // e.g. initiative-register-2026-10-19.xlsx (the organisation's date).
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: organisation.timezone,
    }).format(now);
    return { fileName: `initiative-register-${day}.xlsx`, content };
  }
}

function describeFilters(
  query: RegisterExportQuery,
  names: { element?: string; department?: string },
): string {
  const parts: string[] = [
    query.tab.charAt(0).toUpperCase() + query.tab.slice(1),
  ];
  if (query.health?.length) {
    parts.push(query.health.map((h) => HEALTH_WORDS[h]).join(', '));
  }
  if (query.elementId) parts.push(names.element ?? 'one element');
  if (query.departmentId) parts.push(names.department ?? 'one department');
  if (query.q) parts.push(`search “${query.q}”`);
  parts.push(`sorted by ${query.sort}`);
  return parts.join(' · ');
}
