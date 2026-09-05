import { describe, expect, it } from "vitest";
import { createTestDatabase } from "@/db/testing";
import { isPaused, listExceptions, pauseAll, recordBrowserFailure, recordBrowserSuccess, resolveException, resumeAll } from "@/features/ops/guard";

describe("ops guard", () => {
  it("pauses and resumes globally with a reason", () => {
    const { db } = createTestDatabase();
    expect(isPaused(db).paused).toBe(false);
    pauseAll(db, "Instagram restringiu a conta");
    expect(isPaused(db)).toMatchObject({ paused: true, reason: "Instagram restringiu a conta" });
    expect(listExceptions(db)[0]).toMatchObject({ kind: "paused" });
    resumeAll(db);
    expect(isPaused(db).paused).toBe(false);
  });

  it("opens the circuit after three consecutive browser failures and closes it on success", () => {
    const { db } = createTestDatabase();
    expect(recordBrowserFailure(db, "timeout")).toEqual({ paused: false, failures: 1 });
    recordBrowserSuccess(db);
    expect(recordBrowserFailure(db, "timeout")).toEqual({ paused: false, failures: 1 });
    recordBrowserFailure(db, "timeout");
    expect(recordBrowserFailure(db, "selector not found")).toEqual({ paused: true, failures: 3 });
    expect(isPaused(db).reason).toContain("3 falhas seguidas");
    const open = listExceptions(db);
    resolveException(db, open[0]!.id);
    expect(listExceptions(db).length).toBe(open.length - 1);
  });
});
