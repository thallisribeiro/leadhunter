import { desc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { campaigns } from "@/db/schema";
import { campaignSchema, campaignStatuses, type Campaign, type CampaignInput, type CampaignStatus } from "@/features/campaigns/schema";
export type { CampaignStatus } from "@/features/campaigns/schema";

export const campaignStatusLabels: Record<CampaignStatus, string> = {
  draft: "Rascunho", discovering: "Buscando", enriching: "Enriquecendo", scoring: "Pontuando",
  ready: "Pronta", paused: "Pausada", completed: "Concluída", failed: "Com falha",
};

const listFields = ["targetLocations", "industries", "keywords", "requiredSignals", "preferredSignals", "excludedSignals", "sources", "hashtags"] as const;

function decode(row: typeof campaigns.$inferSelect): Campaign {
  const decoded = Object.fromEntries(listFields.map((field) => [field, JSON.parse(row[field]) as string[]]));
  const value = campaignSchema.parse({ ...row, ...decoded });
  return { ...value, id: row.id, status: row.status as CampaignStatus, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

export function createCampaign(database: AppDatabase, input: CampaignInput): Campaign {
  const value = campaignSchema.parse(input);
  const timestamp = new Date().toISOString();
  const stored = {
    ...value,
    targetLocations: JSON.stringify(value.targetLocations), industries: JSON.stringify(value.industries),
    keywords: JSON.stringify(value.keywords), requiredSignals: JSON.stringify(value.requiredSignals),
    preferredSignals: JSON.stringify(value.preferredSignals), excludedSignals: JSON.stringify(value.excludedSignals),
    sources: JSON.stringify(value.sources), hashtags: JSON.stringify(value.hashtags),
  };
  const id = crypto.randomUUID();
  database.insert(campaigns).values({ ...stored, id, status: "draft", createdAt: timestamp, updatedAt: timestamp }).run();
  return getCampaign(database, id)!;
}

export function getCampaign(database: AppDatabase, id: string): Campaign | null {
  const row = database.select().from(campaigns).where(eq(campaigns.id, id)).get();
  return row ? decode(row) : null;
}

export function listCampaigns(database: AppDatabase): Campaign[] {
  return database.select().from(campaigns).orderBy(desc(campaigns.createdAt)).all().map(decode);
}

export function updateCampaignStatus(database: AppDatabase, id: string, status: CampaignStatus): Campaign {
  if (!campaignStatuses.includes(status)) throw new Error("Invalid campaign status");
  database.update(campaigns).set({ status, updatedAt: new Date().toISOString() }).where(eq(campaigns.id, id)).run();
  const campaign = getCampaign(database, id);
  if (!campaign) throw new Error("Campaign not found");
  return campaign;
}
