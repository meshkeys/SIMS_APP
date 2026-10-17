import { MissingTenantContextError, TenantContext } from './tenant-context.js';

const ORG_A = '0199f0a0-0000-7000-8000-00000000000a';
const ORG_B = '0199f0a0-0000-7000-8000-00000000000b';

describe('TenantContext', () => {
  it('has no context outside run()', () => {
    expect(TenantContext.current()).toBeUndefined();
    expect(() => TenantContext.require()).toThrow(MissingTenantContextError);
  });

  it('exposes the context to everything awaited inside run()', async () => {
    const seen = await TenantContext.run(
      { organisationId: ORG_A },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return TenantContext.require().organisationId;
      },
    );

    expect(seen).toBe(ORG_A);
  });

  it('starts a returned lazy thenable inside the context', async () => {
    // Mimics a Prisma query: nothing runs until .then() is called.
    const lazyQuery = {
      // oxlint-disable-next-line unicorn/no-thenable -- a thenable is the point of this test
      then<R>(resolve: (value: string | undefined) => R) {
        return Promise.resolve(
          resolve(TenantContext.current()?.organisationId),
        );
      },
    };

    const seen = await TenantContext.run(
      { organisationId: ORG_A },
      () => lazyQuery,
    );

    expect(seen).toBe(ORG_A);
  });

  it('keeps concurrent units of work isolated', async () => {
    const read = (organisationId: string, delayMs: number) =>
      TenantContext.run({ organisationId }, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return TenantContext.require().organisationId;
      });

    await expect(
      Promise.all([read(ORG_A, 5), read(ORG_B, 1)]),
    ).resolves.toEqual([ORG_A, ORG_B]);
  });

  it('rejects an organisation id that is not a UUID', () => {
    expect(() =>
      TenantContext.run({ organisationId: "x' OR 1=1 --" }, () => undefined),
    ).toThrow();
  });

  it('freezes the context so it cannot be changed mid-request', () => {
    TenantContext.run({ organisationId: ORG_A }, () => {
      const context = TenantContext.require() as { organisationId: string };
      expect(() => {
        context.organisationId = ORG_B;
      }).toThrow(TypeError);
    });
  });
});
