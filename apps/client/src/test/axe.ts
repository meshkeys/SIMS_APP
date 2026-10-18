import axe from 'axe-core';

/** Accessibility violations (WCAG 2.1 A/AA) found in a rendered container. */
export async function axeViolations(container: Element): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    },
    // jsdom has no layout, so colour contrast is checked in the design tokens instead.
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((v) => `${v.id}: ${v.help}`);
}
