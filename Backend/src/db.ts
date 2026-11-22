import pg from 'pg';

const { Pool } = pg;

const ms = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: ms(process.env.DB_CONNECT_TIMEOUT_MS, 5000),
  query_timeout: ms(process.env.DB_QUERY_TIMEOUT_MS, 10000),
});

pool.on('error', (err) => {
  console.error(`[db] Idle connection error: ${err.message}`);
});