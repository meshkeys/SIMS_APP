import type { z } from 'zod';

/**
 * Plain-English validation messages for the generic rules, so a person sees
 * "Required" rather than "Too small: expected string to have >=1 characters".
 * Messages written on a schema itself (e.g. 'Enter a valid email address')
 * still win. Install once per app: `z.config({ customError: friendlyErrors })`.
 */
export const friendlyErrors: z.core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case 'invalid_type':
      return issue.input === undefined || issue.input === null
        ? 'Required'
        : undefined;
    case 'too_small':
      if (issue.origin === 'string') {
        return Number(issue.minimum) <= 1
          ? 'Required'
          : `Use at least ${issue.minimum} characters`;
      }
      if (issue.origin === 'array') {
        return Number(issue.minimum) <= 1
          ? 'Choose at least one'
          : `Choose at least ${issue.minimum}`;
      }
      if (issue.origin === 'number') {
        return `Must be ${issue.inclusive ? 'at least' : 'more than'} ${issue.minimum}`;
      }
      return undefined;
    case 'too_big':
      if (issue.origin === 'string') return `Use at most ${issue.maximum} characters`;
      if (issue.origin === 'array') return `Choose at most ${issue.maximum}`;
      if (issue.origin === 'number') {
        return `Must be ${issue.inclusive ? 'at most' : 'less than'} ${issue.maximum}`;
      }
      return undefined;
    case 'invalid_format':
      if (issue.format === 'uuid') return 'Choose an item from the list';
      if (issue.format === 'date') return 'Use a date like 2026-12-31';
      if (issue.format === 'email') return 'Enter a valid email address';
      return undefined;
    case 'invalid_value':
      return 'Choose one of the options';
    default:
      return undefined;
  }
};
