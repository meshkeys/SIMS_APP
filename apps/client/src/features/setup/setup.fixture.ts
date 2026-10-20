import {
  DEFAULT_RULESET_CONFIG,
  type FrameworkTemplateView,
  type OnboardingState,
  type SessionResponse,
} from '@sims/contracts';
import { SESSION } from '@/test/fake-api';
import { IDS, MAP } from '../strategy/strategy.fixture';

/** The founder of a workspace that is still being set up. */
export const SETUP_SESSION: SessionResponse = {
  ...SESSION,
  session: {
    ...SESSION.session,
    organisation: {
      ...SESSION.session.organisation,
      status: 'ONBOARDING',
      onboardingStep: 1,
    },
  },
};

/** Just after sign-up: the organisation step is saved, nothing else. */
export const AFTER_SIGNUP: OnboardingState = {
  status: 'ONBOARDING',
  step: 1,
  organisation: {
    id: SESSION.session.organisation.id,
    name: 'Meridian Financial Group',
    slug: 'meridian',
    sector: 'PRIVATE',
    country: 'NG',
    currency: 'NGN',
    timezone: 'Africa/Lagos',
    fiscalYearStartMonth: 1,
    status: 'ONBOARDING',
    terminology: {
      kpi: 'KPI',
      initiative: 'Initiative',
      milestone: 'Milestone',
      task: 'Task',
    },
    createdAt: '2026-10-19T09:00:00.000Z',
  },
  plan: null,
  rules: DEFAULT_RULESET_CONFIG,
  invitations: { pending: 0 },
  customFields: [],
  missing: ['framework', 'vision', 'governance'],
  canComplete: false,
};

/** After the framework step: the plan exists, with pillars and objectives. */
export const WITH_PLAN: OnboardingState = {
  ...AFTER_SIGNUP,
  step: 2,
  plan: {
    id: IDS.plan,
    name: 'Strategic plan 2026–2028',
    template: 'STRATEGIC_PILLARS',
    startDate: '2026-01-01',
    endDate: '2028-12-31',
    vision: null,
    mission: null,
    values: [],
    aspiration: null,
    levels: MAP.levels.map(({ elementCount: _count, ...level }) => level),
    elementCount: MAP.elements.length,
  },
  missing: ['vision', 'governance'],
  canComplete: true,
};

export const TEMPLATES: FrameworkTemplateView[] = [
  {
    key: 'STRATEGIC_PILLARS',
    name: 'Strategic pillars',
    description:
      'Pillars, objectives and KPIs. Common in banks and corporates.',
    levels: [
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
    ],
    starterElements: [],
  },
  {
    key: 'BALANCED_SCORECARD',
    name: 'Balanced Scorecard',
    description: 'Financial, customer, process and learning perspectives.',
    levels: [
      {
        label: 'Perspective',
        pluralLabel: 'Perspectives',
        codePrefix: 'P',
        allowsKpis: false,
      },
      {
        label: 'Strategic objective',
        pluralLabel: 'Strategic objectives',
        codePrefix: 'O',
        allowsKpis: true,
      },
    ],
    starterElements: [
      'Financial',
      'Customer',
      'Internal process',
      'Learning and growth',
    ],
  },
  {
    key: 'OKR',
    name: 'OKRs',
    description: 'Objectives and key results. Suits fast-moving teams.',
    levels: [
      {
        label: 'Objective',
        pluralLabel: 'Objectives',
        codePrefix: 'O',
        allowsKpis: true,
      },
    ],
    starterElements: [],
  },
];
