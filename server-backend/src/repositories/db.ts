import { Pool } from 'pg';
import { config } from '../config';

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

/** Tek satır döndüren query */
export async function queryOne<T>(text: string, params?: unknown[]): Promise<T | null> {
  const { rows } = await pool.query(text, params);
  return rows[0] ?? null;
}

/** Çoklu satır döndüren query */
export async function queryMany<T>(text: string, params?: unknown[]): Promise<T[]> {
  const { rows } = await pool.query(text, params);
  return rows;
}

/** Insert/Update/Delete — etkilenen satır sayısı döner */
export async function execute(text: string, params?: unknown[]): Promise<number> {
  const { rowCount } = await pool.query(text, params);
  return rowCount ?? 0;
}
