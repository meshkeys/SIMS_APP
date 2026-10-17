import type { Role } from '../../../src/generated/prisma/enums.js';

/** Fictional organisation used for demos, local development and e2e tests. */
export const DEMO_ORG = {
  name: 'Meridian Financial Group',
  slug: 'meridian',
  emailDomain: 'meridian.example', // reserved TLD: never routable
} as const;

export const DEPARTMENTS = {
  executive: 'Executive Office',
  strategy: 'Strategy Office',
  business: 'Business Development',
  digital: 'Digital Business',
  technology: 'Technology',
  architecture: 'Enterprise Architecture',
  infrastructure: 'Infrastructure',
  data: 'Data & Analytics',
  products: 'Products',
  wealth: 'Wealth Management',
  finance: 'Finance',
  operations: 'Operations',
  procurement: 'Procurement',
  cx: 'Customer Experience',
  service: 'Customer Service',
  hr: 'Human Resources',
  learning: 'Learning & Development',
  compliance: 'Compliance',
  marketing: 'Marketing',
  audit: 'Internal Audit',
  board: 'Board of Directors',
} as const;

export type DepartmentKey = keyof typeof DEPARTMENTS;

export interface PersonSpec {
  name: string;
  jobTitle: string;
  roles: Role[];
  department: DepartmentKey;
  /** Key of another person (checked when seeding). */
  manager?: string;
}

export const PEOPLE = {
  // Board, executive committee and sponsors
  boardChair: {
    name: 'Olumide Adeyemi',
    jobTitle: 'Board Chair',
    roles: ['BOARD'],
    department: 'board',
  },
  ceo: {
    name: 'Ngozi Eze',
    jobTitle: 'MD/CEO',
    roles: ['CEO'],
    department: 'executive',
  },
  edBusiness: {
    name: 'Tunde Bakare',
    jobTitle: 'ED, Business',
    roles: ['EXECUTIVE_SPONSOR'],
    department: 'executive',
    manager: 'ceo',
  },
  edTech: {
    name: 'Chioma Nwosu',
    jobTitle: 'ED, Technology',
    roles: ['EXECUTIVE_SPONSOR'],
    department: 'executive',
    manager: 'ceo',
  },
  coo: {
    name: 'Ibrahim Musa',
    jobTitle: 'COO',
    roles: ['EXECUTIVE_SPONSOR'],
    department: 'executive',
    manager: 'ceo',
  },
  edRetail: {
    name: 'Funmi Ogunleye',
    jobTitle: 'ED, Retail',
    roles: ['EXECUTIVE_SPONSOR'],
    department: 'executive',
    manager: 'ceo',
  },
  cpo: {
    name: 'Kemi Adebayo',
    jobTitle: 'Chief People Officer',
    roles: ['EXECUTIVE_SPONSOR'],
    department: 'hr',
    manager: 'ceo',
  },

  // Strategy Office ("AB" is the main demo user in the wireframes)
  strategyHead: {
    name: 'Amara Bello',
    jobTitle: 'Head, Strategy Office',
    roles: ['STRATEGY_OFFICE', 'SYSTEM_ADMIN'],
    department: 'strategy',
    manager: 'ceo',
  },
  strategyAnalyst: {
    name: 'Daniel Okoro',
    jobTitle: 'Strategy Analyst',
    roles: ['STRATEGY_OFFICE'],
    department: 'strategy',
    manager: 'strategyHead',
  },

  // Initiative owners ("HD" is the initiative-owner demo user)
  headDigital: {
    name: 'Hassan Danjuma',
    jobTitle: 'Head, Digital Business',
    roles: ['INITIATIVE_OWNER'],
    department: 'digital',
    manager: 'edBusiness',
  },
  headBizDev: {
    name: 'Adaeze Okafor',
    jobTitle: 'Head, Business Development',
    roles: ['INITIATIVE_OWNER'],
    department: 'business',
    manager: 'edBusiness',
  },
  headProducts: {
    name: 'Segun Alabi',
    jobTitle: 'Head, Products',
    roles: ['INITIATIVE_OWNER'],
    department: 'products',
    manager: 'edBusiness',
  },
  headWealth: {
    name: 'Zainab Yusuf',
    jobTitle: 'Head, Wealth',
    roles: ['INITIATIVE_OWNER'],
    department: 'wealth',
    manager: 'edBusiness',
  },
  headFinance: {
    name: 'Emeka Obi',
    jobTitle: 'Head, Finance',
    roles: ['INITIATIVE_OWNER'],
    department: 'finance',
    manager: 'coo',
  },
  headTech: {
    name: 'Bola Johnson',
    jobTitle: 'Head, Technology',
    roles: ['INITIATIVE_OWNER'],
    department: 'technology',
    manager: 'edTech',
  },
  headArch: {
    name: 'Uche Nnamdi',
    jobTitle: 'Head, Architecture',
    roles: ['INITIATIVE_OWNER'],
    department: 'architecture',
    manager: 'edTech',
  },
  headInfra: {
    name: 'Yemi Salami',
    jobTitle: 'Head, Infrastructure',
    roles: ['INITIATIVE_OWNER'],
    department: 'infrastructure',
    manager: 'edTech',
  },
  headData: {
    name: 'Ifeoma Chukwu',
    jobTitle: 'Head, Data',
    roles: ['INITIATIVE_OWNER'],
    department: 'data',
    manager: 'edTech',
  },
  headOps: {
    name: 'Musa Abdullahi',
    jobTitle: 'Head, Operations',
    roles: ['INITIATIVE_OWNER'],
    department: 'operations',
    manager: 'coo',
  },
  headProcurement: {
    name: 'Grace Etim',
    jobTitle: 'Head, Procurement',
    roles: ['INITIATIVE_OWNER'],
    department: 'procurement',
    manager: 'coo',
  },
  headCX: {
    name: 'Tolu Fashola',
    jobTitle: 'Head, Customer Experience',
    roles: ['INITIATIVE_OWNER'],
    department: 'cx',
    manager: 'edRetail',
  },
  headService: {
    name: 'Aisha Lawal',
    jobTitle: 'Head, Customer Service',
    roles: ['INITIATIVE_OWNER'],
    department: 'service',
    manager: 'edRetail',
  },
  headHR: {
    name: 'Peter Okon',
    jobTitle: 'Head, HR',
    roles: ['INITIATIVE_OWNER'],
    department: 'hr',
    manager: 'cpo',
  },
  headLearning: {
    name: 'Halima Garba',
    jobTitle: 'Head, Learning',
    roles: ['INITIATIVE_OWNER'],
    department: 'learning',
    manager: 'cpo',
  },

  // Risk, assurance and delivery staff
  headCompliance: {
    name: 'Victor Ekpo',
    jobTitle: 'Head, Compliance',
    roles: ['TASK_OWNER'],
    department: 'compliance',
    manager: 'ceo',
  },
  headMarketing: {
    name: 'Sade Adewale',
    jobTitle: 'Head, Marketing',
    roles: ['TASK_OWNER'],
    department: 'marketing',
    manager: 'edRetail',
  },
  auditor: {
    name: 'Rasheed Bello',
    jobTitle: 'Head, Internal Audit',
    roles: ['INTERNAL_AUDIT'],
    department: 'audit',
  },
  productManager: {
    name: 'Nkechi Ibe',
    jobTitle: 'Product Manager, Digital',
    roles: ['TASK_OWNER'],
    department: 'digital',
    manager: 'headDigital',
  },
} as const satisfies Record<string, PersonSpec>;

export type PersonKey = keyof typeof PEOPLE;

export const emailFor = (key: PersonKey): string => {
  const [first, ...rest] = PEOPLE[key].name.toLowerCase().split(' ');
  return `${first}.${rest.join('-')}@${DEMO_ORG.emailDomain}`;
};
