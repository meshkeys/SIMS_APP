import type { PackContent, PackInitiativeRow } from '@sims/contracts';
import { renderPackHtml } from './pack-html.js';

const row = (n: number): PackInitiativeRow => ({
  code: `DIG-${String(n).padStart(3, '0')}`,
  title: n === 1 ? '<script>alert(1)</script> Platform' : `Initiative ${n}`,
  pillar: 'Digital',
  owner: 'Head, Digital',
  health: 'RED',
  verifiedProgress: 40,
  plannedProgress: 60,
  gapPp: -20,
  impactScore: null,
  impactSummary: null,
});

const PACK: PackContent = {
  title: 'Q3 2026 Board pack & "notes"',
  template: 'QUARTERLY_BOARD',
  audience: 'BOARD',
  period: 'September 2026',
  lockedAt: '2026-10-08T11:00:00.000Z',
  organisation: 'Meridian',
  pageCount: 4,
  sensitiveSummarised: 2,
  sections: [
    // 10 rows at 8 a page: two pages.
    {
      key: 'exceptions',
      title: 'Delayed & at-risk initiatives',
      pages: 2,
      initiatives: Array.from({ length: 10 }, (_, i) => row(i + 1)),
    },
    {
      key: 'decisions',
      title: 'Decisions required from the Board',
      pages: 1,
      decisions: [],
    },
  ],
};

describe('renderPackHtml', () => {
  const html = renderPackHtml(PACK);

  it('prints one page per estimated page, numbered', () => {
    expect(html.match(/<section class="page">/g)).toHaveLength(PACK.pageCount);
    expect(html).toContain('Page 4 of 4');
    expect(html).toContain('(2 of 2)');
  });

  it('escapes everything people typed', () => {
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; Platform');
    expect(html).toContain('Q3 2026 Board pack &amp; &quot;notes&quot;');
  });

  it('says when sensitive initiatives are summarised, and when nothing is waiting', () => {
    expect(html).toContain(
      'Sensitive initiatives (2) are summarised at pillar level for this audience.',
    );
    expect(html).toContain('No decisions are waiting.');
  });

  it('is self-contained: no scripts and no external resources', () => {
    expect(html).not.toMatch(/<script|<link|src="http|url\(http/i);
  });
});
