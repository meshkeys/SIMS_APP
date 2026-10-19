import type { MemberAdmin } from '@sims/contracts';
import { plural } from '@/lib/format';

/** What someone is accountable for, in words. Empty when nothing. */
export function responsibilityList(member: MemberAdmin): string[] {
  const { owns, sponsors, decisionsPending } = member.responsibilities;
  return [
    owns > 0 && `owns ${plural(owns, 'live initiative')}`,
    sponsors > 0 && `sponsors ${plural(sponsors, 'live initiative')}`,
    decisionsPending > 0 &&
      `has ${plural(decisionsPending, 'decision')} waiting`,
  ].filter((part): part is string => Boolean(part));
}
