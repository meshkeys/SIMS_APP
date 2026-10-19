import type { NestExpressApplication } from '@nestjs/platform-express';
import { DEFAULT_RULESET_CONFIG, type OnboardingState } from '@sims/contracts';
import type pg from 'pg';
import request from 'supertest';
import { createAdminPool, resetDatabase } from '../setup/admin-db.js';
import { createTestApp } from '../setup/create-app.js';

const PILLARS = [
  {
    label: 'Strategic pillar',
    pluralLabel: 'Strategic pillars',
    codePrefix: 'P',
    allowsKpis: false,
  },
  {
    label: 'Strategic objective',
    pluralLabel: 'Strategic objectives',
    codePrefix: 'O',
    allowsKpis: true,
  },
];
const TERMS = {
  kpi: 'Outcome indicator',
  initiative: 'Project',
  milestone: 'Milestone',
  task: 'Task',
};

describe('Workspace set-up (e2e)', () => {
  let app: NestExpressApplication;
  let admin: pg.Pool;
  let bearer: string;

  const call = (
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    body?: object,
  ) =>
    request(app.getHttpServer())
      [method](`/api/v1${path}`)
      .auth(bearer, { type: 'bearer' })
      .send(body);
  const state = async () =>
    (await call('get', '/onboarding')).body as OnboardingState;

  beforeAll(async () => {
    admin = createAdminPool();
    await resetDatabase(admin);
    app = await createTestApp();
    const signup = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        organisationName: 'Lagos State Ministry of Planning',
        sector: 'PUBLIC',
        country: 'NG',
        name: 'Kemi Bakare',
        jobTitle: 'Director, Strategy',
        email: 'kemi@planning.example',
        password: 'planning-password-2026',
      });
    expect(signup.status).toBe(201);
    bearer = signup.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  it('starts after sign-up with the organisation step done and no plan', async () => {
    const response = await call('get', '/onboarding');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ONBOARDING',
      step: 1,
      plan: null,
      missing: ['framework', 'vision', 'governance'],
      canComplete: false,
      rules: DEFAULT_RULESET_CONFIG,
      invitations: { pending: 0 },
      customFields: [],
    });
    expect(response.body.organisation.name).toBe(
      'Lagos State Ministry of Planning',
    );

    const early = await call('post', '/onboarding/complete');
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('SETUP_INCOMPLETE');
  });

  it('saves the organisation step, checking time zone and currency', async () => {
    const organisation = {
      name: 'Ministry of Economic Planning',
      sector: 'PUBLIC',
      country: 'ng',
      currency: 'ngn',
      timezone: 'Africa/Lagos',
      fiscalYearStartMonth: 4,
    };
    const bad = await call('put', '/onboarding/organisation', {
      ...organisation,
      timezone: 'Lagos',
    });
    expect(bad.status).toBe(400);
    expect(bad.body.errors[0].path).toBe('timezone');

    const saved = await call('put', '/onboarding/organisation', organisation);
    expect(saved.status).toBe(200);
    expect(saved.body.organisation).toMatchObject({
      name: 'Ministry of Economic Planning',
      country: 'NG',
      currency: 'NGN',
      fiscalYearStartMonth: 4,
    });
  });

  it('creates the plan from the framework step, then renames levels in place', async () => {
    const first = await call('put', '/onboarding/framework', {
      template: 'STRATEGIC_PILLARS',
      levels: PILLARS,
      terminology: TERMS,
    });

    expect(first.status).toBe(200);
    const plan = first.body.plan as NonNullable<OnboardingState['plan']>;
    expect(plan.template).toBe('STRATEGIC_PILLARS');
    expect(plan.levels.map((l) => l.label)).toEqual([
      'Strategic pillar',
      'Strategic objective',
    ]);
    // Three financial years, from the April that starts the current one.
    expect(plan.startDate).toMatch(/-04-01$/);
    expect(plan.endDate).toMatch(/-03-31$/);
    expect(first.body.organisation.terminology).toEqual(TERMS);
    expect(first.body.step).toBe(2);
    expect(first.body.missing).toEqual(['vision', 'governance']);
    expect(first.body.canComplete).toBe(true);

    const renamed = await call('put', '/onboarding/framework', {
      template: 'STRATEGIC_PILLARS',
      levels: [
        {
          ...PILLARS[0],
          id: plan.levels[0]!.id,
          label: 'Theme',
          pluralLabel: 'Themes',
        },
        { ...PILLARS[1], id: plan.levels[1]!.id },
      ],
      terminology: TERMS,
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.plan.id).toBe(plan.id);
    expect(renamed.body.plan.levels[0]).toMatchObject({
      id: plan.levels[0]!.id,
      label: 'Theme',
    });
  });

  it('starts the levels again when another framework is chosen', async () => {
    const response = await call('put', '/onboarding/framework', {
      template: 'BALANCED_SCORECARD',
      levels: [
        {
          label: 'Perspective',
          pluralLabel: 'Perspectives',
          codePrefix: 'P',
          allowsKpis: false,
        },
        PILLARS[1],
      ],
      terminology: TERMS,
    });

    expect(response.status).toBe(200);
    expect(response.body.plan).toMatchObject({
      template: 'BALANCED_SCORECARD',
      elementCount: 4,
    });
    expect(response.body.plan.levels[0].label).toBe('Perspective');
  });

  it('saves the plan period and statements', async () => {
    const response = await call('put', '/onboarding/vision', {
      name: 'Medium-term development plan',
      startDate: '2026-04-01',
      endDate: '2030-03-31',
      vision: 'A prosperous, well-planned state.',
      mission: null,
      values: ['Integrity', 'Service'],
      aspiration: null,
    });

    expect(response.status).toBe(200);
    expect(response.body.plan).toMatchObject({
      name: 'Medium-term development plan',
      startDate: '2026-04-01',
      vision: 'A prosperous, well-planned state.',
      values: ['Integrity', 'Service'],
    });
    expect(response.body.step).toBe(3);
  });

  it('applies the starting rules directly, without a new version', async () => {
    const config = {
      ...DEFAULT_RULESET_CONFIG,
      rag: { greenMaxPpBehind: 8, amberMaxPpBehind: 20 },
    };
    const response = await call('put', '/onboarding/governance', { config });

    expect(response.status).toBe(200);
    expect(response.body.rules.rag).toEqual(config.rag);
    expect(response.body.missing).toEqual([]);

    const rulesets = await call('get', '/rulesets');
    expect(rulesets.body.history).toHaveLength(1);
    expect(rulesets.body.active).toMatchObject({ version: 1, config });

    const audit = await call('get', '/audit?action=RULESET_SET_UP');
    expect(audit.body.items[0].after.changes).toContain(
      'Green up to: 5 pp → 8 pp',
    );
  });

  it('adds and removes custom fields', async () => {
    const created = await call('post', '/custom-fields', {
      label: 'Funding source',
      type: 'SELECT',
      options: ['Federal', 'State', 'Donor'],
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      entity: 'INITIATIVE',
      key: 'funding_source',
      options: ['Federal', 'State', 'Donor'],
      required: false,
      sortOrder: 0,
    });

    const duplicate = await call('post', '/custom-fields', {
      label: 'Funding  source',
      type: 'TEXT',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('FIELD_EXISTS');

    const oneChoice = await call('post', '/custom-fields', {
      label: 'Priority',
      type: 'SELECT',
      options: ['High'],
    });
    expect(oneChoice.status).toBe(400);
    expect(oneChoice.body.errors[0].path).toBe('options');

    const budget = await call('post', '/custom-fields', {
      label: 'Budget code',
      type: 'TEXT',
    });
    expect((await state()).customFields.map((f) => f.label)).toEqual([
      'Funding source',
      'Budget code',
    ]);

    expect(
      (await call('delete', `/custom-fields/${budget.body.id}`)).status,
    ).toBe(204);
    expect((await state()).customFields).toHaveLength(1);
  });

  it('finishes set-up, after which the set-up steps are closed', async () => {
    const response = await call('post', '/onboarding/complete');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ACTIVE',
      step: 5,
      canComplete: false,
    });

    const me = await call('get', '/auth/me');
    expect(me.body.organisation).toMatchObject({
      status: 'ACTIVE',
      onboardingStep: 5,
    });

    const late = await call('put', '/onboarding/governance', {
      config: DEFAULT_RULESET_CONFIG,
    });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('ONBOARDING_FINISHED');
  });
});
