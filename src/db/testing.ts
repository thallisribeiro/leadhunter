import { applySchema, createDatabase } from "@/db/client";

export function createTestDatabase() {
  const database = createDatabase(":memory:");
  applySchema(database.sqlite);
  return database;
}
