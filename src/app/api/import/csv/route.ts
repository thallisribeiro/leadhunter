import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { leadFields, parseLeadCsv, type LeadField } from "@/integrations/discovery/csv";
import { upsertDiscoveredLead } from "@/features/discovery/service";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { campaignId?: string; csv?: string; mapping?: Record<string, string> };
    if (!body.campaignId || !body.csv) return NextResponse.json({ error: "Campanha e CSV são obrigatórios." }, { status: 400 });
    const mapping = Object.fromEntries(Object.entries(body.mapping ?? {}).filter((entry): entry is [string, LeadField] => leadFields.includes(entry[1] as LeadField)));
    const leads = parseLeadCsv(body.csv, mapping);
    const imported = leads.map((lead) => upsertDiscoveredLead(db, body.campaignId!, lead, "csv"));
    return NextResponse.json({ imported: imported.length, leadIds: imported.map((lead) => lead.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível importar o CSV." }, { status: 400 });
  }
}
