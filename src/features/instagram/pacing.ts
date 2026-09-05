// Human rhythm for first-contact DMs. Account health, not detection evasion: the same discipline a real SDR keeps.
export interface PacingConfig {
  maxPerDay: number;
  minSecondsBetween: number;
  maxSecondsBetween: number;
  operatingHours: string; // "09:00-20:00"
  timezone: string;
  warmupStartedAt: string | null; // ISO date of the first real send; null = no warmup yet
}

export function pacingConfigFromEnv(env: NodeJS.ProcessEnv = process.env, warmupStartedAt: string | null = null): PacingConfig {
  return {
    maxPerDay: Number(env.MAX_DMS_PER_DAY ?? 30),
    minSecondsBetween: Number(env.MIN_SECONDS_BETWEEN_DMS ?? 90),
    maxSecondsBetween: Number(env.MAX_SECONDS_BETWEEN_DMS ?? 240),
    operatingHours: env.OPERATING_HOURS ?? "09:00-20:00",
    timezone: env.OPERATING_TIMEZONE ?? env.APP_TIMEZONE ?? "America/Bahia",
    warmupStartedAt,
  };
}

export function parseOperatingHours(value: string): { start: number; end: number } {
  const match = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`OPERATING_HOURS inválido: ${value}`);
  return { start: Number(match[1]) * 60 + Number(match[2]), end: Number(match[3]) * 60 + Number(match[4]) };
}

export function localMinutes(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function localDay(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// Warmup: 5/day in the first week, +5 each week, capped by maxPerDay.
export function dailyCap(now: Date, config: PacingConfig): number {
  if (!config.warmupStartedAt) return Math.min(5, config.maxPerDay);
  const days = Math.max(0, Math.floor((now.getTime() - new Date(config.warmupStartedAt).getTime()) / 86_400_000));
  return Math.min(config.maxPerDay, 5 + 5 * Math.floor(days / 7));
}

export function nextGapMs(config: PacingConfig, rng: () => number = Math.random): number {
  const min = config.minSecondsBetween, max = Math.max(config.maxSecondsBetween, min);
  return Math.round((min + rng() * (max - min)) * 1_000);
}

export type PacingVerdict = { ok: true } | { ok: false; reason: "outside_hours" | "daily_cap" | "too_soon"; waitMs: number };

export function canSendNow(input: { now: Date; sentToday: number; lastSentAt: string | null; config: PacingConfig; rng?: () => number }): PacingVerdict {
  const { now, config } = input;
  const { start, end } = parseOperatingHours(config.operatingHours);
  const minutes = localMinutes(now, config.timezone);
  if (minutes < start || minutes >= end) {
    const untilStart = minutes < start ? start - minutes : 24 * 60 - minutes + start;
    return { ok: false, reason: "outside_hours", waitMs: untilStart * 60_000 };
  }
  if (input.sentToday >= dailyCap(now, config)) return { ok: false, reason: "daily_cap", waitMs: (24 * 60 - minutes + start) * 60_000 };
  if (input.lastSentAt) {
    const elapsed = now.getTime() - new Date(input.lastSentAt).getTime();
    const gap = nextGapMs(config, input.rng);
    if (elapsed < config.minSecondsBetween * 1_000) return { ok: false, reason: "too_soon", waitMs: gap - elapsed };
  }
  return { ok: true };
}

// Typing rhythm for the browser: per-character delay with jitter, a pause before sending.
export function typingDelayMs(rng: () => number = Math.random): number { return 40 + Math.round(rng() * 90); }
