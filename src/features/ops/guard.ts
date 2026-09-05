// Global pause and circuit breaker. Every outbound path checks isPaused() first; nothing overrides it.
import type { AppDatabase } from "@/db/client";

export function getSetting(database: AppDatabase, key: string): string | null {
  return (database.$client.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}

export function setSetting(database: AppDatabase, key: string, value: string): void {
  database.$client.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .run(key, value, new Date().toISOString());
}

export function isPaused(database: AppDatabase): { paused: boolean; reason: string | null; since: string | null } {
  const reason = getSetting(database, "pause_reason");
  return { paused: getSetting(database, "paused") === "1", reason, since: getSetting(database, "paused_at") };
}

export function pauseAll(database: AppDatabase, reason: string, leadId?: string): void {
  setSetting(database, "paused", "1"); setSetting(database, "pause_reason", reason); setSetting(database, "paused_at", new Date().toISOString());
  recordException(database, { kind: "paused", message: reason, leadId });
}

export function resumeAll(database: AppDatabase): void {
  setSetting(database, "paused", "0"); setSetting(database, "pause_reason", ""); setSetting(database, "browser_failures", "0");
}

export function recordException(database: AppDatabase, input: { kind: string; message: string; leadId?: string }): string {
  const id = crypto.randomUUID();
  database.$client.prepare("INSERT INTO exceptions (id, lead_id, kind, message, resolved, created_at) VALUES (?, ?, ?, ?, 0, ?)").run(id, input.leadId ?? null, input.kind, input.message.slice(0, 2_000), new Date().toISOString());
  return id;
}

export const BROWSER_FAILURE_LIMIT = 3;

// Three consecutive browser failures mean the session, the DOM or the account changed: stop and ask a human.
export function recordBrowserFailure(database: AppDatabase, message: string, leadId?: string): { paused: boolean; failures: number } {
  const failures = Number(getSetting(database, "browser_failures") ?? 0) + 1;
  setSetting(database, "browser_failures", String(failures));
  recordException(database, { kind: "browser_failure", message, leadId });
  if (failures >= BROWSER_FAILURE_LIMIT) { pauseAll(database, `${failures} falhas seguidas do navegador: ${message}`, leadId); return { paused: true, failures }; }
  return { paused: false, failures };
}

export function recordBrowserSuccess(database: AppDatabase): void { setSetting(database, "browser_failures", "0"); }

export function listExceptions(database: AppDatabase, onlyOpen = true) {
  return database.$client.prepare(`SELECT e.id, e.lead_id, e.kind, e.message, e.resolved, e.created_at, l.company_name FROM exceptions e LEFT JOIN leads l ON l.id = e.lead_id ${onlyOpen ? "WHERE e.resolved = 0" : ""} ORDER BY e.created_at DESC LIMIT 200`)
    .all() as Array<{ id: string; lead_id: string | null; kind: string; message: string; resolved: number; created_at: string; company_name: string | null }>;
}

export function resolveException(database: AppDatabase, id: string): void { database.$client.prepare("UPDATE exceptions SET resolved = 1 WHERE id = ?").run(id); }
