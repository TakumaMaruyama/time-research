import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";

function toUpsertSql(seedSql: string): string {
  return seedSql.replace(
    /INSERT INTO (\w+) \(([^)]+)\) VALUES \(([\s\S]*?)\) ON CONFLICT \(id\) DO NOTHING;/g,
    (statement: string, table: string, columnList: string, values: string): string => {
      const columns = columnList.split(",").map((column: string) => column.trim());
      const updateColumns = columns.filter((column: string) => column !== "id");
      if (updateColumns.length === 0) {
        return statement;
      }

      const updateSet = updateColumns
        .map((column: string) => `${column} = EXCLUDED.${column}`)
        .join(", ");
      return `INSERT INTO ${table} (${columnList}) VALUES (${values}) ON CONFLICT (id) DO UPDATE SET ${updateSet};`;
    },
  );
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const seedPath = join(__dirname, "..", "drizzle", "seed.sql");
    const rawSql = readFileSync(seedPath, "utf-8");
    const sql = toUpsertSql(rawSql);

    console.log("Applying seed.sql (upsert mode)...");
    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("COMMIT");
    } catch (err) {
      await pool.query("ROLLBACK");
      throw err;
    }
    console.log("Seed complete.");
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
