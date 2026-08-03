/** Apply ../../db/migrations/*.sql in order. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dirCandidates = [
  path.resolve(__dirname, "../../../db/migrations"),
  path.resolve(process.cwd(), "db/migrations"),
  "/app/db/migrations",
];
const dir =
  dirCandidates.find((d) => fs.existsSync(d)) || dirCandidates[0];

async function main() {
  const pool = getPool();
  await pool.query(`
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
    const { rows } = await pool.query(
      `SELECT 1 FROM schema_migrations WHERE filename = $1`,
      [file],
    );
    if (rows.length) {
      console.log(JSON.stringify({ msg: "skip", file }));
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    console.log(JSON.stringify({ msg: "apply", file }));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        `INSERT INTO schema_migrations (filename) VALUES ($1)`,
        [file],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  await pool.end();
  console.log(JSON.stringify({ msg: "migrate complete", n: files.length }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
