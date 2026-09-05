import type { AppDatabase } from "@/db/client";

function cell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportCampaignCsv(database: AppDatabase, campaignId: string): string {
  const rows = database.$client.prepare(`SELECT l.company_name, COALESCE((SELECT score FROM lead_scores s WHERE s.lead_id = l.id AND s.campaign_id = ? ORDER BY created_at DESC LIMIT 1), '') AS score,
    COALESCE((SELECT confidence FROM lead_scores s WHERE s.lead_id = l.id AND s.campaign_id = ? ORDER BY created_at DESC LIMIT 1), '') AS confidence,
    l.industry, l.city, l.region, l.country, l.opportunity, l.primary_email, l.primary_phone, l.website, l.status
    FROM campaign_leads cl JOIN leads l ON l.id = cl.lead_id WHERE cl.campaign_id = ? ORDER BY score DESC, l.company_name`).all(campaignId, campaignId, campaignId) as Array<Record<string, unknown>>;
  const headers = ["empresa", "score", "confianca", "segmento", "cidade", "estado", "pais", "oportunidade", "email", "telefone", "website", "status"];
  const keys = ["company_name", "score", "confidence", "industry", "city", "region", "country", "opportunity", "primary_email", "primary_phone", "website", "status"];
  return [headers.join(","), ...rows.map((row) => keys.map((key) => cell(row[key])).join(","))].join("\r\n");
}
