import type { AppDatabase } from "@/db/client";
import type { LeadCrawler } from "@/integrations/web/crawler";
import { extractBusinessData } from "@/features/enrichment/extract";

interface LeadRow { id: string; company_name: string; website: string | null; primary_email: string | null; primary_phone: string | null; status: string; industry: string | null; city: string | null; region: string | null; country: string | null; description: string | null; opportunity: string | null; shortlisted: number; created_at: string; updated_at: string }
interface ContactRow { id: string; type: string; value: string; source_url: string | null }
interface EvidenceRow { id: string; type: string; value: string; source_url: string; source_provider: string; captured_at: string }

function normalizeContact(type: string, value: string): string {
  if (type === "email") return value.trim().toLowerCase();
  if (type === "phone") return value.replace(/\D/g, "");
  return value.trim().toLowerCase().replace(/\/$/, "");
}

export async function enrichLead(database: AppDatabase, leadId: string, crawler: LeadCrawler) {
  const sqlite = database.$client;
  const lead = sqlite.prepare("SELECT * FROM leads WHERE id = ?").get(leadId) as LeadRow | undefined;
  if (!lead) throw new Error("Lead not found");
  if (!lead.website) throw new Error("Lead has no website to enrich");
  sqlite.prepare("UPDATE leads SET status = 'enriching', updated_at = ? WHERE id = ?").run(new Date().toISOString(), leadId);
  const pages = await crawler.crawl(lead.website);
  let primaryEmail = lead.primary_email; let primaryPhone = lead.primary_phone; let description = lead.description;
  const allSignals = new Set<string>();
  sqlite.transaction(() => {
    for (const page of pages) {
      const data = extractBusinessData(page.html, page.url);
      description ||= data.description;
      const contacts = [
        ...data.emails.map((value) => ({ type: "email", value })), ...data.phones.map((value) => ({ type: "phone", value })),
        ...Object.entries(data.socials).map(([type, value]) => ({ type, value })),
      ];
      for (const contact of contacts) {
        if (!contact.value) continue;
        sqlite.prepare("INSERT OR IGNORE INTO lead_contacts (id, lead_id, type, value, normalized_value, source_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(crypto.randomUUID(), leadId, contact.type, contact.value, normalizeContact(contact.type, contact.value), page.url, new Date().toISOString());
        if (contact.type === "email") primaryEmail ||= contact.value;
        if (contact.type === "phone") primaryPhone ||= contact.value;
      }
      if (data.description) sqlite.prepare("INSERT OR IGNORE INTO lead_evidence (id, lead_id, type, value, source_url, source_provider, metadata, captured_at) VALUES (?, ?, 'description', ?, ?, 'crawler', '{}', ?)").run(crypto.randomUUID(), leadId, data.description, page.url, new Date().toISOString());
      for (const signal of data.signals) {
        allSignals.add(signal);
        sqlite.prepare("INSERT OR IGNORE INTO lead_evidence (id, lead_id, type, value, source_url, source_provider, metadata, captured_at) VALUES (?, ?, 'signal', ?, ?, 'crawler', '{}', ?)").run(crypto.randomUUID(), leadId, signal, page.url, new Date().toISOString());
      }
    }
    const opportunity = allSignals.has("agendamento por telefone") && !allSignals.has("agendamento online") ? "O site direciona para agendamento por telefone; um fluxo próprio de agendamento online não foi detectado nas páginas analisadas." : "Evidência insuficiente para apontar uma oportunidade específica.";
    sqlite.prepare("UPDATE leads SET primary_email = COALESCE(primary_email, ?), normalized_email = COALESCE(normalized_email, ?), primary_phone = COALESCE(primary_phone, ?), normalized_phone = COALESCE(normalized_phone, ?), description = COALESCE(description, ?), opportunity = ?, status = 'enriched', updated_at = ? WHERE id = ?")
      .run(primaryEmail, primaryEmail?.toLowerCase() ?? null, primaryPhone, primaryPhone?.replace(/\D/g, "") ?? null, description, opportunity, new Date().toISOString(), leadId);
  })();
  return getLeadProfile(database, leadId);
}

export function getLeadProfile(database: AppDatabase, leadId: string) {
  const sqlite = database.$client;
  const lead = sqlite.prepare("SELECT * FROM leads WHERE id = ?").get(leadId) as LeadRow | undefined;
  if (!lead) return null;
  const contacts = sqlite.prepare("SELECT id, type, value, source_url FROM lead_contacts WHERE lead_id = ? ORDER BY type, value").all(leadId) as ContactRow[];
  const evidence = sqlite.prepare("SELECT id, type, value, source_url, source_provider, captured_at FROM lead_evidence WHERE lead_id = ? ORDER BY captured_at DESC").all(leadId) as EvidenceRow[];
  const sources = sqlite.prepare("SELECT provider, source_url, captured_at FROM lead_sources WHERE lead_id = ? ORDER BY captured_at DESC").all(leadId) as Array<{ provider: string; source_url: string; captured_at: string }>;
  const score = sqlite.prepare("SELECT score, confidence, breakdown, why_this_lead FROM lead_scores WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1").get(leadId) as { score: number; confidence: number; breakdown: string; why_this_lead: string } | undefined;
  return {
    lead,
    contacts: contacts.map((contact) => ({ id: contact.id, type: contact.type, value: contact.value, sourceUrl: contact.source_url })),
    evidence: evidence.map((item) => ({ id: item.id, type: item.type, value: item.value, sourceUrl: item.source_url, sourceProvider: item.source_provider, capturedAt: item.captured_at })),
    sources: sources.map((source) => ({ provider: source.provider, sourceUrl: source.source_url, capturedAt: source.captured_at })),
    score: score ? { ...score, breakdown: JSON.parse(score.breakdown) as unknown } : null,
  };
}
