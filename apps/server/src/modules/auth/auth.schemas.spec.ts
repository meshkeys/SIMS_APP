import { BadRequestException } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { slugify } from './auth.service.js';
import { loginSchema, signupSchema } from '@sims/contracts';

describe('auth input', () => {
  it('normalises email, country and currency, and applies defaults', () => {
    const parsed = new ZodValidationPipe(signupSchema).transform({
      organisationName: '  Acme  ',
      sector: 'PUBLIC',
      country: 'gh',
      name: 'Kofi Mensah',
      email: '  Kofi@Example.COM ',
      password: 'long-enough-password',
      unexpected: 'stripped',
    });

    expect(parsed).toEqual({
      organisationName: 'Acme',
      sector: 'PUBLIC',
      country: 'GH',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      name: 'Kofi Mensah',
      email: 'kofi@example.com',
      password: 'long-enough-password',
    });
  });

  it('reports every invalid field with a stable error code', () => {
    try {
      new ZodValidationPipe(signupSchema).transform({
        timezone: 'Mars/Olympus',
      });
      expect.fail('expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse() as {
        code: string;
        errors: { path: string }[];
      };
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(body.errors.map((e) => e.path)).toEqual(
        expect.arrayContaining([
          'organisationName',
          'sector',
          'country',
          'timezone',
          'name',
          'email',
          'password',
        ]),
      );
    }
  });

  it('does not apply strength rules at sign-in', () => {
    expect(() =>
      new ZodValidationPipe(loginSchema).transform({
        email: 'a@b.co',
        password: 'old',
      }),
    ).not.toThrow();
  });
});

describe('slugify', () => {
  it.each([
    ['Meridian Financial Group', 'meridian-financial-group'],
    ['Société Générale  Côte d’Ivoire', 'societe-generale-cote-d-ivoire'],
    [
      '  --Lagos State Ministry of Health--  ',
      'lagos-state-ministry-of-health',
    ],
  ])('%s → %s', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it('pads very short names into a valid address', () => {
    expect(slugify('X')).toMatch(/^x-[a-z0-9]{4}$/);
    expect(slugify('!!!')).toMatch(/^org-[a-z0-9]{4}$/);
  });

  it('keeps addresses within the length limit', () => {
    expect(slugify('a'.repeat(200)).length).toBeLessThanOrEqual(50);
  });
});
