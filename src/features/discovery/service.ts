import type { AppDatabase } from "@/db/client";
import type { DiscoveredLead, DiscoveryInput, LeadDiscoveryProvider } from "@/features/discovery/types";
import { normalizeLeadIdentity } from "@/features/discovery/dedupe";

interface LeadRow { id: string }

export function instagramHandle(value: string | undefined | null): string | null {
  if (!value) return null;
  const handle = value.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/[/?#].*$/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(handle) ? handle : null;
}

export function upsertDiscoveredLead(database: AppDatabase, campaignId: string, lead: DiscoveredLead, provider: string) {
  const sqlite = database.$client;
  const identity = normalizeLeadIdentity(lead);
  const handle = instagramHandle(lead.instagram);
  return sqlite.transaction(() => {
    const clauses: string[] = [];
    const values: string[] = [];
    for (const [column, value] of [["instagram_handle", handle], ["normalized_domain", identity.normalizedDomain], ["normalized_phone", identity.normalizedPhone], ["normalized_email", identity.normalizedEmail], ["canonical_url", identity.canonicalUrl]] as const) {
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
    if (handle) attachInstagram(database, id, handle, lead, now);
    const campaign = sqlite.prepare("SELECT funnel FROM campaigns WHERE id = ?").get(campaignId) as { funnel: string } | undefined;
    if (campaign?.funnel === "affiliate") sqlite.prepare("UPDATE leads SET funnel = 'affiliate' WHERE id = ? AND funnel = 'customer' AND NOT EXISTS (SELECT 1 FROM campaign_leads cl JOIN campaigns c ON c.id = cl.campaign_id WHERE cl.lead_id = leads.id AND c.funnel = 'customer')").run(id);
    return sqlite.prepare("SELECT * FROM leads WHERE id = ?").get(id) as Record<string, unknown> & { id: string };
  })();
}

// Instagram handle, public profile snapshot, contact row and bio evidence. Evidence is what scoring and
// the opening message are allowed to use, so the bio goes in as evidence with the profile URL as source.
function attachInstagram(database: AppDatabase, leadId: string, handle: string, lead: DiscoveredLead, now: string) {
  const sqlite = database.$client;
  const url = `https://www.instagram.com/${handle}/`;
  sqlite.prepare("UPDATE leads SET instagram_handle = COALESCE(instagram_handle, ?), updated_at = ? WHERE id = ?").run(handle, now, leadId);
  if (!sqlite.prepare("SELECT 1 FROM lead_contacts WHERE lead_id = ? AND type = 'instagram'").get(leadId)) {
    sqlite.prepare("INSERT INTO lead_contacts (id, lead_id, type, value, normalized_value, source_url, created_at) VALUES (?, ?, 'instagram', ?, ?, ?, ?)").run(crypto.randomUUID(), leadId, url, handle, lead.sourceUrl, now);
  }
  const profile = lead.raw?.profile as { bio?: string; followers?: number | null; name?: string } | undefined;
  if (!profile) return;
  const role = typeof lead.raw?.decisionRole === "string" ? lead.raw.decisionRole : null;
  sqlite.prepare("UPDATE leads SET profile = ?, decision_role = COALESCE(?, decision_role), description = COALESCE(description, ?), updated_at = ? WHERE id = ?").run(JSON.stringify(profile), role, profile.bio || null, now, leadId);
  sqlite.prepare("DELETE FROM lead_evidence WHERE lead_id = ? AND type = 'instagram_bio'").run(leadId);
  if (profile.bio) sqlite.prepare("INSERT INTO lead_evidence (id, lead_id, type, value, source_url, source_provider, captured_at, metadata) VALUES (?, ?, 'instagram_bio', ?, ?, 'instagram', ?, ?)").run(crypto.randomUUID(), leadId, profile.bio.slice(0, 500), url, now, JSON.stringify({ followers: profile.followers ?? null }));
  for (const signal of Array.isArray(lead.raw?.signals) ? (lead.raw.signals as string[]) : []) {
    if (!sqlite.prepare("SELECT 1 FROM lead_evidence WHERE lead_id = ? AND type = 'signal' AND value = ?").get(leadId, signal)) sqlite.prepare("INSERT INTO lead_evidence (id, lead_id, type, value, source_url, source_provider, captured_at, metadata) VALUES (?, ?, 'signal', ?, ?, 'instagram', ?, '{}')").run(crypto.randomUUID(), leadId, signal, url, now);
  }
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
