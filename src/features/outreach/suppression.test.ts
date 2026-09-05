import { afterEach, describe, expect, test } from "vitest";
import { createTestDatabase } from "@/db/testing";
import { isSuppressed, suppress } from "@/features/outreach/suppression";

describe("global suppression", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

  test("blocks a normalized email across every campaign", () => {
    const database = createTestDatabase(); cleanups.push(database.close);
    suppress(database.db, { type: "email", value: " Stop@Example.com ", reason: "Solicitou remoção" });
    expect(isSuppressed(database.db, { email: "stop@example.com" })).toBe(true);
  });
});
