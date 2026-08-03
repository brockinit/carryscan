#!/usr/bin/env node
/** Apply db/migrations/*.sql in order against DATABASE_URL. */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dir = path.join(root, "db", "migrations");
const url =
  process.env.DATABASE_URL ||
  "postgresql://carryscan:carryscan@localhost:5432/carryscan";

const client = new pg.Client({ connectionString: url });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`);

const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const file of files) {
  const { rows } = await client.query(
    `SELECT 1 FROM schema_migrations WHERE filename = $1`,
    [file],
  );
  if (rows.length) {
    console.log(JSON.stringify({ msg: "skip", file }));
    continue;
  }
  const sql = fs.readFileSync(path.join(dir, file), "utf8");
  console.log(JSON.stringify({ msg: "apply", file }));
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      `INSERT INTO schema_migrations (filename) VALUES ($1)`,
      [file],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(JSON.stringify({ msg: "migrate failed", file, err: String(e) }));
    process.exit(1);
  }
}

await client.end();
console.log(JSON.stringify({ msg: "migrate complete", files: files.length }));
