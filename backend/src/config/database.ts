import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Connection pool — critical for production throughput.
// Pool size should be tuned based on PostgreSQL's max_connections and
// number of API server instances. Rule of thumb: cores * 2 + effective_spindle_count.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                    // max pool connections
  idleTimeoutMillis: 30_000,  // close idle connections after 30s
  connectionTimeoutMillis: 5_000,
  // Ensure we're always working with numeric types correctly
  // (pg returns NUMERIC as string by default — we parse in the service layer)
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(1);
});

/**
 * Execute a function within a database transaction.
 * Automatically commits on success and rolls back on any error.
 * This is the primary mechanism for ensuring atomicity in financial operations.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function query<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const { rows } = await pool.query(text, params);
  return rows as T[];
}

export async function queryOne<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
