import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { getCampaign, updateCampaignStatus } from "@/features/campaigns/actions";
import { discoverWithProviders } from "@/features/discovery/service";
import type { LeadDiscoveryProvider } from "@/features/discovery/types";
import { createSeedUrlProvider } from "@/integrations/discovery/seed-urls";
import { createOverpassProvider } from "@/integrations/discovery/overpass";
import { createGooglePlacesProvider } from "@/integrations/discovery/google-places";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const campaign = getCampaign(db, id);
  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { seedUrls?: string[] };
  const providers: LeadDiscoveryProvider[] = [];
  if (campaign.sources.includes("seed_urls") && body.seedUrls?.length) providers.push(createSeedUrlProvider(body.seedUrls));
  if (campaign.sources.includes("overpass")) providers.push(createOverpassProvider());
  const google = campaign.sources.includes("google_places") ? createGooglePlacesProvider() : null;
  if (google) providers.push(google);
  updateCampaignStatus(db, id, "discovering");
  const results = await discoverWithProviders(db, id, { campaignId: id, locations: campaign.targetLocations, industries: campaign.industries, keywords: campaign.keywords, limit: campaign.targetLeadCount, seedUrls: body.seedUrls }, providers);
  updateCampaignStatus(db, id, results.some((result) => !result.error) ? "enriching" : "failed");
  return NextResponse.json({ results });
}
