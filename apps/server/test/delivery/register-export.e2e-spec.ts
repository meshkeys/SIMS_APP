import type { NestExpressApplication } from '@nestjs/platform-express';
import ExcelJS from 'exceljs';
import type pg from 'pg';
import request from 'supertest';
import { emailFor } from '../../prisma/seed/demo/people.js';
import { CLOCK, FixedClock } from '../../src/common/clock/clock.js';
import { createAdminPool } from '../setup/admin-db.js';
import { createTestApp } from '../setup/create-app.js';
import { loadDemo, signInAs } from '../setup/demo.js';

const AMARA = emailFor('strategyHead'); // sees every initiative
const HASSAN = emailFor('headDigital'); // cannot see the 2 sensitive ones

/** Reads a binary response body into a Buffer. */
const binary = (
  res: NodeJS.ReadableStream & { setEncoding(e: string): void },
  done: (error: Error | null, body: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};

describe('Register export (e2e)', () => {
  let app: NestExpressApplication;
  let admin: pg.Pool;
  let token: ReturnType<typeof signInAs>;

  const download = async (as: string, query = '') => {
    const bearer = await token(as);
    const response = await request(app.getHttpServer())
      .get(`/api/v1/initiatives/export${query}`)
      .auth(bearer, { type: 'bearer' })
      .buffer(true)
      .parse(binary as never);
    const workbook = new ExcelJS.Workbook();
    if (response.status === 200) {
      const bytes = response.body as Buffer;
      // Exactly this file's bytes (a Buffer may share a larger memory pool).
      await workbook.xlsx.load(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
      );
    }
    return { response, workbook };
  };
  const rows = (workbook: ExcelJS.Workbook) => {
    const sheet = workbook.getWorksheet('Register')!;
    const header = sheet.getRow(1).values as string[];
    const result: Record<string, unknown>[] = [];
    sheet.eachRow((row, n) => {
      if (n === 1) return;
      const values = row.values as unknown[];
      result.push(
        Object.fromEntries(
          header.map((h, i) => [h, values[i]]).filter(([h]) => h),
        ),
      );
    });
    return result;
  };

  beforeAll(async () => {
    admin = createAdminPool();
    await loadDemo(admin);
    app = await createTestApp({
      overrides: [
        {
          provide: CLOCK,
          useValue: new FixedClock(new Date('2026-10-16T09:00:00Z')),
        },
      ],
    });
    token = signInAs(app);
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  it('downloads the active register as an Excel workbook', async () => {
    const { response, workbook } = await download(AMARA);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="initiative-register-2026-10-16.xlsx"',
    );
    expect(response.headers['cache-control']).toBe('no-store');

    const register = rows(workbook);
    expect(register).toHaveLength(32);
    // Same order as the screen: worst health first.
    expect(register[0]).toMatchObject({
      ID: 'DIG-007',
      Initiative: 'Automate Customer Onboarding',
      Health: 'Delayed',
    });
    // Typed cells: dates are dates, percentages are numbers.
    expect(register[0]!['Due']).toBeInstanceOf(Date);
    expect(typeof register[0]!['Verified %']).toBe('number');

    const about = workbook.getWorksheet('About')!;
    expect(about.getCell('B1').value).toBe('Meridian Financial Group');
    expect(about.getCell('B3').value).toBe('Amara Bello');
    expect(about.getCell('B4').value).toBe('Active · sorted by health');
    expect(about.getCell('B5').value).toBe('32');
  });

  it('applies the screen’s filters', async () => {
    const { workbook } = await download(AMARA, '?health=RED&sort=code');
    const register = rows(workbook);
    const ids = register.map((r) => r['ID'] as string);
    expect(ids).toEqual(ids.toSorted((a, b) => a.localeCompare(b)));
    expect(register).toHaveLength(4);
    for (const row of register) expect(row['Health']).toBe('Delayed');
    expect(workbook.getWorksheet('About')!.getCell('B4').value).toBe(
      'Active · Delayed · sorted by code',
    );
  });

  it('never includes restricted initiatives the person may not see', async () => {
    const all = rows((await download(AMARA)).workbook);
    expect(all.filter((r) => r['Restricted'] === 'Yes')).toHaveLength(2);

    const limited = rows((await download(HASSAN)).workbook);
    expect(limited).toHaveLength(30);
    expect(limited.filter((r) => r['Restricted'] === 'Yes')).toHaveLength(0);
  });

  it('rejects bad filters before building anything', async () => {
    const { response } = await download(AMARA, '?health=PURPLE');
    expect(response.status).toBe(400);
  });
});
