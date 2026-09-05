import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { parseLeadCsv } from "@/integrations/discovery/csv";
import { upsertDiscoveredLead } from "@/features/discovery/service";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { campaignId?: string; csv?: string; mapping?: Record<string, never> };
    if (!body.campaignId || !body.csv) return NextResponse.json({ error: "Campanha e CSV são obrigatórios." }, { status: 400 });
    const leads = parseLeadCsv(body.csv, body.mapping);
    const imported = leads.map((lead) => upsertDiscoveredLead(db, body.campaignId!, lead, "csv"));
    return NextResponse.json({ imported: imported.length, leadIds: imported.map((lead) => lead.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível importar o CSV." }, { status: 400 });
  }
}
