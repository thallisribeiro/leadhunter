import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import * as schema from "@/db/schema";

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;

// Migrations are plain SQL, applied in file order and idempotent: CREATE ... IF NOT EXISTS, and
// ALTER TABLE ADD COLUMN is skipped when the column already exists (SQLite has no IF NOT EXISTS there).
export function applySchema(sqlite: Database.Database): void {
  const dir = path.join(process.cwd(), "src", "db", "migrations");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    const statements = readFileSync(path.join(dir, file), "utf8").split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
    for (const statement of statements) {
      try { sqlite.exec(statement); }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/duplicate column name|already exists/i.test(message)) throw error;
      }
    }
  }
}

export function createDatabase(filename: string) {
  if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true });
  const sqlite = new Database(filename);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  if (filename !== ":memory:") sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema });
  return { sqlite, db, close: () => sqlite.close() };
}

function databasePath(): string {
  const configured = process.env.DATABASE_URL ?? "file:./data/leadhunter.db";
  if (!configured.startsWith("file:")) throw new Error("DATABASE_URL must use the file: protocol");
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), configured.slice(5));
}

// Opened lazily on first use: importing this module (tests, tooling) must not touch the database file.
let connection: ReturnType<typeof createDatabase> | null = null;
function open() {
  if (!connection) { connection = createDatabase(databasePath()); applySchema(connection.sqlite); }
  return connection;
}
function lazy<T extends object>(pick: () => T): T {
  return new Proxy({} as T, {
    get(_, prop) { const target = pick(); const value = Reflect.get(target, prop, target); return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value; },
    has(_, prop) { return Reflect.has(pick(), prop); },
  });
}

export const sqlite = lazy(() => open().sqlite);
export const db = lazy(() => open().db);
