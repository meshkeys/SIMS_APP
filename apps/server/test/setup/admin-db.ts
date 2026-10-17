import pg from 'pg';
import { TEST_DATABASE_ADMIN_URL } from './test-database.js';

/**
 * A superuser connection to the test database for arranging fixtures and
 * inspecting the catalog. Superusers bypass row-level security, so never use
 * this to assert what the application can see — use the app's own clients.
 */
export function createAdminPool(): pg.Pool {
  return new pg.Pool({ connectionString: TEST_DATABASE_ADMIN_URL, max: 2 });
}

/**
 * Empties every application table (keeps migration history).
 *
 * Uses DELETE with foreign-key triggers paused rather than TRUNCATE: test
 * fixtures are tiny, and TRUNCATE rewrites a new file per table, which costs
 * ~1.5 s per call on Docker Desktop. Runs on one connection in one transaction.
 */
export async function resetDatabase(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ name: string }>(`
      SELECT quote_ident(tablename) AS name
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    `);
    await client.query('BEGIN');
    await client.query('SET LOCAL session_replication_role = replica');
    for (const { name } of rows) {
      await client.query(`DELETE FROM ${name}`);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
