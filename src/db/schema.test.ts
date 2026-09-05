import { afterEach, describe, expect, test } from "vitest";
import { createTestDatabase } from "@/db/testing";

describe("database foundation", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
  });

  test("enforces foreign keys", () => {
    const database = createTestDatabase();
    cleanups.push(database.close);

    expect(() =>
      database.sqlite
        .prepare("insert into lead_sources (id, lead_id, provider, source_url, captured_at) values (?, ?, ?, ?, ?)")
        .run("source-1", "missing-lead", "csv", "fixture.csv", new Date().toISOString()),
    ).toThrow(/foreign key/i);
  });

  test("uses WAL and a busy timeout", () => {
    const database = createTestDatabase();
    cleanups.push(database.close);

    expect(database.sqlite.pragma("journal_mode", { simple: true })).toBe("memory");
    expect(Number(database.sqlite.pragma("busy_timeout", { simple: true }))).toBeGreaterThanOrEqual(5_000);
  });
});
