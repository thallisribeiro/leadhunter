import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { businessProfiles } from "@/db/schema";
import { businessProfileSchema, type BusinessProfile, type BusinessProfileInput } from "@/features/business/schema";

const profileId = "local-business";
const jsonFields = ["verifiedClaims", "forbiddenClaims", "targetIndustries", "targetBusinessTypes", "targetLocations", "targetKeywords", "positiveSignals", "negativeSignals", "exclusions", "exampleMessages"] as const;

function decode(row: typeof businessProfiles.$inferSelect): BusinessProfile {
  const parsed = Object.fromEntries(jsonFields.map((field) => [field, JSON.parse(row[field]) as string[]]));
  const value = businessProfileSchema.parse({ ...row, ...parsed });
  return { ...value, id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

export function getBusinessProfile(database: AppDatabase): BusinessProfile | null {
  const row = database.select().from(businessProfiles).where(eq(businessProfiles.id, profileId)).get();
  return row ? decode(row) : null;
}

export function needsOnboarding(database: AppDatabase): boolean {
  return getBusinessProfile(database) === null;
}

export function saveBusinessProfile(database: AppDatabase, input: BusinessProfileInput): BusinessProfile {
  const value = businessProfileSchema.parse(input);
  const now = new Date().toISOString();
  const stored = {
    ...value,
    verifiedClaims: JSON.stringify(value.verifiedClaims), forbiddenClaims: JSON.stringify(value.forbiddenClaims),
    targetIndustries: JSON.stringify(value.targetIndustries), targetBusinessTypes: JSON.stringify(value.targetBusinessTypes),
    targetLocations: JSON.stringify(value.targetLocations), targetKeywords: JSON.stringify(value.targetKeywords),
    positiveSignals: JSON.stringify(value.positiveSignals), negativeSignals: JSON.stringify(value.negativeSignals),
    exclusions: JSON.stringify(value.exclusions), exampleMessages: JSON.stringify(value.exampleMessages),
  };
  database.insert(businessProfiles).values({ ...stored, id: profileId, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: businessProfiles.id, set: { ...stored, updatedAt: now } }).run();
  return getBusinessProfile(database)!;
}
