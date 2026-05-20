import pg from 'pg';

export class DatabaseClient {
  private pool!: pg.Pool;

  connect(connectionString: string): void {
    this.pool = new pg.Pool({ connectionString, max: 5 });
  }

  async query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const result = await this.pool.query<T>(sql, params);
    return result.rows;
  }

  async queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async close(): Promise<void> {
    await this.pool?.end();
  }
}

/**
 * Creates a named database using the provided admin connection string.
 * The admin URL should point at an existing database (e.g. the default `ssz_test`).
 */
export async function createDatabase(adminUrl: string, dbName: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
  try {
    await pool.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await pool.end();
  }
}
