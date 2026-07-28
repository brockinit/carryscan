import { Pool } from "pg";

const globalForPg = globalThis as unknown as { pgPool?: Pool };

export function hasDatabase(): boolean {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  // Treat explicit localhost defaults as unset in serverless
  if (process.env.VERCEL && /localhost|127\.0\.0\.1/.test(url)) return false;
  return true;
}

export function getPool(): Pool {
  if (!globalForPg.pgPool) {
    globalForPg.pgPool = new Pool({
      connectionString:
        process.env.DATABASE_URL ||
        "postgresql://carryscan:carryscan@localhost:5432/carryscan",
      max: 10,
    });
  }
  return globalForPg.pgPool;
}
