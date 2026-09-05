import type { AppDatabase } from "@/db/client";

export type SuppressionType = "email" | "domain" | "phone" | "company" | "instagram";

function normalize(type: SuppressionType, value: string): string {
  if (type === "email") return value.trim().toLowerCase();
  if (type === "instagram") return value.trim().toLowerCase().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
  if (type === "phone") return value.replace(/\D/g, "");
  if (type === "domain") {
    try { return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, ""); } catch { return value.trim().toLowerCase(); }
  }
  return value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

export function suppress(database: AppDatabase, input: { type: SuppressionType; value: string; reason: string }) {
  const normalizedValue = normalize(input.type, input.value); const now = new Date().toISOString();
  database.$client.prepare("INSERT INTO suppressions (id, type, value, normalized_value, reason, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(type, normalized_value) DO UPDATE SET reason = excluded.reason")
    .run(crypto.randomUUID(), input.type, input.value.trim(), normalizedValue, input.reason, now);
  return { ...input, normalizedValue };
}

export function isSuppressed(database: AppDatabase, lead: { email?: string | null; domain?: string | null; phone?: string | null; companyName?: string | null }): boolean {
  const candidates: Array<[SuppressionType, string]> = [];
  if (lead.email) candidates.push(["email", normalize("email", lead.email)]);
  if (lead.domain) candidates.push(["domain", normalize("domain", lead.domain)]);
  if (lead.phone) candidates.push(["phone", normalize("phone", lead.phone)]);
  if (lead.companyName) candidates.push(["company", normalize("company", lead.companyName)]);
  return candidates.some(([type, value]) => Boolean(database.$client.prepare("SELECT 1 FROM suppressions WHERE type = ? AND normalized_value = ?").get(type, value)));
}
