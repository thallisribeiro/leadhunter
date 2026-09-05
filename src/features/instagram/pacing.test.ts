import { describe, expect, it } from "vitest";
import { canSendNow, dailyCap, localMinutes, nextGapMs, parseOperatingHours, type PacingConfig } from "@/features/instagram/pacing";

const config: PacingConfig = { maxPerDay: 30, minSecondsBetween: 90, maxSecondsBetween: 240, operatingHours: "09:00-20:00", timezone: "UTC", warmupStartedAt: null };
const at = (iso: string) => new Date(iso);

describe("pacing", () => {
  it("parses operating hours and local minutes in the configured timezone", () => {
    expect(parseOperatingHours("09:00-20:00")).toEqual({ start: 540, end: 1200 });
    expect(localMinutes(at("2026-09-08T12:30:00Z"), "UTC")).toBe(750);
    expect(localMinutes(at("2026-09-08T12:30:00Z"), "America/Bahia")).toBe(570);
    expect(() => parseOperatingHours("9-20")).toThrow();
  });

  it("warms up: 5 a day in week one, +5 per week, capped by maxPerDay", () => {
    expect(dailyCap(at("2026-09-08T12:00:00Z"), config)).toBe(5);
    const started = { ...config, warmupStartedAt: "2026-09-01T12:00:00Z" };
    expect(dailyCap(at("2026-09-03T12:00:00Z"), started)).toBe(5);
    expect(dailyCap(at("2026-09-09T12:00:00Z"), started)).toBe(10);
    expect(dailyCap(at("2026-10-27T12:00:00Z"), started)).toBe(30);
    expect(dailyCap(at("2027-01-01T12:00:00Z"), started)).toBe(30);
  });

  it("blocks outside operating hours, at the daily cap and too soon after the last send", () => {
    expect(canSendNow({ now: at("2026-09-08T07:00:00Z"), sentToday: 0, lastSentAt: null, config })).toMatchObject({ ok: false, reason: "outside_hours", waitMs: 2 * 3_600_000 });
    expect(canSendNow({ now: at("2026-09-08T21:00:00Z"), sentToday: 0, lastSentAt: null, config })).toMatchObject({ ok: false, reason: "outside_hours" });
    expect(canSendNow({ now: at("2026-09-08T12:00:00Z"), sentToday: 5, lastSentAt: null, config })).toMatchObject({ ok: false, reason: "daily_cap" });
    expect(canSendNow({ now: at("2026-09-08T12:00:00Z"), sentToday: 1, lastSentAt: "2026-09-08T11:59:30Z", config, rng: () => 0 })).toMatchObject({ ok: false, reason: "too_soon", waitMs: 60_000 });
    expect(canSendNow({ now: at("2026-09-08T12:00:00Z"), sentToday: 1, lastSentAt: "2026-09-08T11:55:00Z", config })).toEqual({ ok: true });
  });

  it("randomizes the gap inside the configured window", () => {
    expect(nextGapMs(config, () => 0)).toBe(90_000);
    expect(nextGapMs(config, () => 1)).toBe(240_000);
  });
});
