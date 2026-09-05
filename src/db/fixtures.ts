import type { AppDatabase } from "@/db/client";
import { saveBusinessProfile } from "@/features/business/actions";
import { createCampaign, getCampaign, updateCampaignStatus } from "@/features/campaigns/actions";
import { upsertDiscoveredLead } from "@/features/discovery/service";
import { enrichLead } from "@/features/enrichment/service";
import { generateOutreachDraft } from "@/features/outreach/draft";
import { scoreLead } from "@/features/scoring/service";
import type { LeadCrawler } from "@/integrations/web/crawler";

const demoCompanies = [
  ["Ocean Dental Studio", "ocean-dental"], ["Bright Smile Miami", "bright-smile"],
  ["Coral Dental Care", "coral-dental"], ["Biscayne Dentistry", "biscayne-dentistry"],
  ["Palm Cosmetic Dental", "palm-cosmetic"], ["Sunset Dental House", "sunset-dental"],
  ["Brickell Smile Lab", "brickell-smile"], ["Bayfront Dental Arts", "bayfront-dental"],
  ["Little Havana Dental", "havana-dental"], ["Coconut Grove Smiles", "grove-smiles"],
  ["Key Dental Boutique", "key-dental"], ["Design District Dental", "design-dental"],
  ["River Dental Clinic", "river-dental"], ["Mango Dental Group", "mango-dental"],
  ["Royal Palm Dentistry", "royal-palm"], ["Vista Dental Miami", "vista-dental"],
  ["Blue Lagoon Dental", "blue-lagoon"], ["South Point Smiles", "south-point"],
  ["Metro Dental Atelier", "metro-dental"], ["Evergreen Dental Miami", "evergreen-dental"],
] as const;

export const demoLeads = demoCompanies.map(([companyName, slug], index) => ({
  companyName,
  website: `https://${slug}.example`,
  email: `${index % 2 === 0 ? "hello" : "care"}@${slug}.example`,
  phone: `+1305555${String(index + 101).padStart(4, "0")}`,
  city: "Miami",
  country: "USA",
  instagram: `https://instagram.com/${slug.replace(/-/g, "")}`,
  sourceUrl: `fixture:${index + 1}`,
}));

export const fixtureCrawler: LeadCrawler = {
  async crawl(startUrl) {
    const host = new URL(startUrl).hostname;
    const name = demoLeads.find((lead) => new URL(lead.website).hostname === host)?.companyName ?? host;
    return [{
      url: startUrl,
      html: `<html><head><title>${name}</title><meta name="description" content="Cosmetic dentistry, implants and dental aesthetics in Miami"></head><body><h1>Cosmetic dentistry</h1><p>Implantes e odontologia estética. Agendamento por telefone.</p><a href="mailto:contact@${host}">Email</a><a href="tel:+13055550100">Telefone</a><a href="https://instagram.com/${host.split(".")[0]}">Instagram</a></body></html>`,
    }];
  },
};

export async function seedDemoData(database: AppDatabase) {
  saveBusinessProfile(database, {
    businessName: "Estúdio Horizonte",
    website: "https://estudio-horizonte.example",
    businessDescription: "Agência fictícia de sites para negócios locais.",
    offer: "Sites orientados a conversão.",
    oneLinePitch: "Transformamos visitas em conversas comerciais.",
    averageTicket: null,
    salesGoal: "Agendar conversas qualificadas",
    verifiedClaims: ["Atendimento em português e inglês"],
    forbiddenClaims: ["Garantia de aumento de receita"],
    targetIndustries: ["odontologia"], targetBusinessTypes: ["clínica odontológica"],
    targetLocations: ["Miami, Florida"], targetCompanySize: "Negócios locais",
    targetKeywords: ["cosmetic dentistry"], positiveSignals: ["odontologia estética"],
    negativeSignals: [], exclusions: [], outreachGoal: "Agendar uma conversa de 15 minutos",
    callToAction: "Faz sentido eu enviar duas ideias?", tone: "Direto e consultivo",
    outreachLanguage: "pt-BR", exampleMessages: [], additionalInstructions: "Dados exclusivamente fictícios para demonstração.",
  });

  const existing = database.$client.prepare("SELECT id FROM campaigns WHERE name = ? ORDER BY created_at LIMIT 1").get("Dentistas Miami · Demo") as { id: string } | undefined;
  const campaign = existing ? getCampaign(database, existing.id)! : createCampaign(database, {
    name: "Dentistas Miami · Demo", description: "Demonstração local com 20 empresas fictícias.",
    targetLocations: ["Miami, Florida, USA"], industries: ["dentist", "dental clinic"],
    keywords: ["cosmetic dentistry"], requiredSignals: [], preferredSignals: ["odontologia estética"],
    excludedSignals: [], sources: ["csv", "seed_urls"], targetLeadCount: 20, minimumScore: 50, outreachLanguage: "pt-BR",
  });

  const leadIds: string[] = [];
  for (const input of demoLeads) {
    const lead = upsertDiscoveredLead(database, campaign.id, input, "fixture");
    leadIds.push(lead.id);
    const evidence = database.$client.prepare("SELECT 1 FROM lead_evidence WHERE lead_id = ? LIMIT 1").get(lead.id);
    if (!evidence) await enrichLead(database, lead.id, fixtureCrawler);
    const score = database.$client.prepare("SELECT 1 FROM lead_scores WHERE lead_id = ? AND campaign_id = ? LIMIT 1").get(lead.id, campaign.id);
    if (!score) scoreLead(database, lead.id, campaign.id);
  }

  for (const leadId of leadIds.slice(0, 5)) {
    database.$client.prepare("UPDATE leads SET shortlisted = 1, status = 'shortlisted', updated_at = ? WHERE id = ?").run(new Date().toISOString(), leadId);
    const draft = database.$client.prepare("SELECT 1 FROM outreach_drafts WHERE lead_id = ? AND campaign_id = ? AND channel = 'email' LIMIT 1").get(leadId, campaign.id);
    if (!draft) {
      generateOutreachDraft(database, leadId, campaign.id, "email");
      database.$client.prepare("UPDATE leads SET status = 'draft_ready', updated_at = ? WHERE id = ?").run(new Date().toISOString(), leadId);
    }
  }
  updateCampaignStatus(database, campaign.id, "ready");
  return { campaignId: campaign.id, leadIds };
}
