import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import * as schema from "@/db/schema";

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;

export function applySchema(sqlite: Database.Database): void {
  const migrationPath = path.join(process.cwd(), "src", "db", "migrations", "0000_initial.sql");
  sqlite.exec(readFileSync(migrationPath, "utf8"));
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

const connection = createDatabase(databasePath());
applySchema(connection.sqlite);

export const sqlite = connection.sqlite;
export const db = connection.db;
