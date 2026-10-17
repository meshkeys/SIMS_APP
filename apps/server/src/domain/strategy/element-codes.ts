/**
 * Element codes follow the tree: P1, P2… at the top; O1.1, O1.2… under P1;
 * deeper levels continue the numbering (KR1.2.3). Users may also type their
 * own code; generated ones never collide with existing siblings.
 */

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The numeric part of a code: "P1" → "1", "O1.2" → "1.2", "SO3.1" → "3.1". */
export function numberingOf(code: string): string {
  return code.replace(/^[^0-9]+/, '');
}

export function nextElementCode(options: {
  /** The level's prefix, e.g. "O". */
  prefix: string;
  /** The parent's code, or undefined for a top-level element. */
  parentCode?: string;
  /** Codes already used by siblings (same parent, same level). */
  siblingCodes: readonly string[];
}): string {
  const base = options.parentCode ? `${numberingOf(options.parentCode)}.` : '';
  const pattern = new RegExp(
    `^${escape(options.prefix)}${escape(base)}(\\d+)$`,
    'i',
  );
  const highest = options.siblingCodes.reduce((max, code) => {
    const match = code.match(pattern);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${options.prefix}${base}${highest + 1}`;
}
