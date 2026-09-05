import type { AppDatabase } from "@/db/client";
import type { DiscoveredLead, DiscoveryInput, LeadDiscoveryProvider } from "@/features/discovery/types";
import { normalizeLeadIdentity } from "@/features/discovery/dedupe";

interface LeadRow { id: string }

export function upsertDiscoveredLead(database: AppDatabase, campaignId: string, lead: DiscoveredLead, provider: string) {
  const sqlite = database.$client;
  const identity = normalizeLeadIdentity(lead);
  return sqlite.transaction(() => {
    const clauses: string[] = [];
    const values: string[] = [];
    for (const [column, value] of [["normalized_domain", identity.normalizedDomain], ["normalized_phone", identity.normalizedPhone], ["normalized_email", identity.normalizedEmail], ["canonical_url", identity.canonicalUrl]] as const) {
      if (value) { clauses.push(`${column} = ?`); values.push(value); }
    }
    if (clauses.length === 0) { clauses.push("(normalized_name = ? AND location_key = ?)"); values.push(identity.normalizedName, identity.locationKey); }
    const existing = sqlite.prepare(`SELECT id FROM leads WHERE ${clauses.join(" OR ")} ORDER BY created_at LIMIT 1`).get(...values) as LeadRow | undefined;
    const id = existing?.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    if (existing) {
      sqlite.prepare(`UPDATE leads SET
        company_name = CASE WHEN length(?) > length(company_name) THEN ? ELSE company_name END,
        website = COALESCE(website, ?), normalized_domain = COALESCE(normalized_domain, ?),
        primary_email = COALESCE(primary_email, ?), normalized_email = COALESCE(normalized_email, ?),
        primary_phone = COALESCE(primary_phone, ?), normalized_phone = COALESCE(normalized_phone, ?),
        canonical_url = COALESCE(canonical_url, ?), city = COALESCE(city, ?), region = COALESCE(region, ?), country = COALESCE(country, ?), updated_at = ?
        WHERE id = ?`).run(lead.companyName, lead.companyName, lead.website ?? null, identity.normalizedDomain, lead.email ?? null, identity.normalizedEmail, lead.phone ?? null, identity.normalizedPhone, identity.canonicalUrl, lead.city ?? null, lead.region ?? null, lead.country ?? null, now, id);
    } else {
      sqlite.prepare(`INSERT INTO leads (id, company_name, normalized_name, website, normalized_domain, primary_email, normalized_email, primary_phone, normalized_phone, canonical_url, city, region, country, location_key, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'discovered', ?, ?)`).run(id, lead.companyName.trim(), identity.normalizedName, lead.website ?? null, identity.normalizedDomain, lead.email ?? null, identity.normalizedEmail, lead.phone ?? null, identity.normalizedPhone, identity.canonicalUrl, lead.city ?? null, lead.region ?? null, lead.country ?? null, identity.locationKey, now, now);
    }
    sqlite.prepare("INSERT OR IGNORE INTO campaign_leads (campaign_id, lead_id, created_at) VALUES (?, ?, ?)").run(campaignId, id, now);
    sqlite.prepare("INSERT OR IGNORE INTO lead_sources (id, lead_id, provider, source_url, external_id, metadata, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(crypto.randomUUID(), id, provider, lead.sourceUrl, lead.externalId ?? null, JSON.stringify(lead.raw ?? {}), now);
    return sqlite.prepare("SELECT * FROM leads WHERE id = ?").get(id) as Record<string, unknown> & { id: string };
  })();
}

export async function discoverWithProviders(database: AppDatabase, campaignId: string, input: DiscoveryInput, providers: LeadDiscoveryProvider[]) {
  const results: Array<{ provider: string; count: number; error?: string }> = [];
  for (const provider of providers) {
    let count = 0;
    try {
      for await (const lead of provider.discover(input)) {
        upsertDiscoveredLead(database, campaignId, lead, provider.name);
        count += 1;
        if (count >= input.limit) break;
      }
      results.push({ provider: provider.name, count });
    } catch (error) {
      results.push({ provider: provider.name, count, error: error instanceof Error ? error.message : "Unknown provider error" });
    }
  }
  return results;
}
