import { z } from "zod";

export const campaignStatuses = ["draft", "discovering", "enriching", "scoring", "ready", "paused", "completed", "failed"] as const;
export type CampaignStatus = (typeof campaignStatuses)[number];

export const campaignSchema = z.object({
  name: z.string().trim().min(3),
  description: z.string().trim().default(""),
  targetLocations: z.array(z.string().trim().min(1)).min(1),
  industries: z.array(z.string().trim().min(1)).min(1),
  keywords: z.array(z.string().trim().min(1)).default([]),
  requiredSignals: z.array(z.string().trim().min(1)).default([]),
  preferredSignals: z.array(z.string().trim().min(1)).default([]),
  excludedSignals: z.array(z.string().trim().min(1)).default([]),
  sources: z.array(z.enum(["csv", "seed_urls", "overpass", "google_places", "instagram"])).min(1),
  targetLeadCount: z.number().int().min(1).max(5_000),
  minimumScore: z.number().int().min(0).max(100),
  outreachLanguage: z.string().trim().min(2),
  funnel: z.enum(["customer", "affiliate"]).default("customer"),
  autopilot: z.boolean().default(false),
  hashtags: z.array(z.string().trim().min(1).transform((value) => value.replace(/^#/, "").toLowerCase())).default([]),
});

export type CampaignInput = z.input<typeof campaignSchema>;
export type Campaign = z.output<typeof campaignSchema> & { id: string; status: CampaignStatus; createdAt: string; updatedAt: string };
