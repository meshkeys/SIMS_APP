import { AUDIT_READER_ROLES, INVITER_ROLES, type Role } from '@sims/contracts';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useSession } from '@/auth/use-auth';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { hasAnyRole } from '@/lib/access';
import { cn } from '@/lib/cn';
import { AuditLog } from './audit-log';
import { DepartmentsAdmin } from './departments-admin';
import { OrganisationSettingsSection } from './organisation-settings';
import { PeopleAdmin } from './people-admin';
import { type RulesSection, RulesWorkspace } from './rules-workspace';

const route = getRouteApi('/app/admin');

const RULES_READERS: readonly Role[] = [
  'STRATEGY_OFFICE',
  'SYSTEM_ADMIN',
  'CEO',
];

/** Every section, in menu order, with who may open it. */
const SECTIONS = [
  {
    key: 'organisation',
    label: 'Organisation',
    note: 'Name, currency, time zone, terms',
    roles: RULES_READERS,
  },
  {
    key: 'rules',
    label: 'RAG & health rules',
    note: 'Thresholds and overrides',
    roles: RULES_READERS,
  },
  {
    key: 'escalation',
    label: 'Escalation rules',
    note: 'Ladder and timings',
    roles: RULES_READERS,
  },
  {
    key: 'cycle',
    label: 'Reporting cycles',
    note: 'Cadence, windows, reminders',
    roles: RULES_READERS,
  },
  {
    key: 'versions',
    label: 'Rule versions',
    note: 'Every rule change, read-only',
    roles: RULES_READERS,
  },
  {
    key: 'people',
    label: 'Users & roles',
    note: 'Invite, change roles, end access',
    roles: INVITER_ROLES,
  },
  {
    key: 'departments',
    label: 'Departments',
    note: 'How the organisation is structured',
    roles: INVITER_ROLES,
  },
  {
    key: 'audit',
    label: 'Audit log',
    note: 'Every change, read-only',
    roles: AUDIT_READER_ROLES,
  },
] as const;
type SectionKey = (typeof SECTIONS)[number]['key'];

const RULES_SECTIONS: readonly SectionKey[] = [
  'rules',
  'escalation',
  'cycle',
  'versions',
];
const isRulesSection = (key: SectionKey): key is RulesSection =>
  RULES_SECTIONS.includes(key);

/**
 * Governance and configuration. Each person sees only the sections their
 * roles allow: rules for the Strategy Office and the MD/CEO, people and
 * departments for those who manage access, the audit log for internal audit too.
 */
export function AdminPage() {
  const session = useSession();
  const search = route.useSearch();
  const allowed = SECTIONS.filter((s) => hasAnyRole(session, s.roles));
  const current =
    allowed.find((s) => s.key === search.section) ??
    allowed.find((s) => s.key === 'rules') ??
    allowed[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Administration · Governance & configuration"
        title="Administration"
        description="Rule changes follow maker-checker: proposed here, approved by the MD/CEO, logged in full."
      />
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Administration sections">
          <Card>
            <ul className="flex flex-col gap-1 p-2">
              {allowed.map((s) => (
                <li key={s.key}>
                  <Link
                    to="/admin"
                    search={{ section: s.key }}
                    aria-current={s.key === current?.key ? 'page' : undefined}
                    className={cn(
                      'block rounded-md px-3 py-2',
                      s.key === current?.key
                        ? 'bg-primary-soft'
                        : 'hover:bg-surface-muted',
                    )}
                  >
                    <span className="block text-sm font-medium text-ink">
                      {s.label}
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {s.note}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          {current && isRulesSection(current.key) && (
            <RulesWorkspace section={current.key} />
          )}
          {current?.key === 'organisation' && <OrganisationSettingsSection />}
          {current?.key === 'people' && <PeopleAdmin />}
          {current?.key === 'departments' && <DepartmentsAdmin />}
          {current?.key === 'audit' && <AuditLog />}
        </div>
      </div>
    </div>
  );
}
