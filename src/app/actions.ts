"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { saveBusinessProfile } from "@/features/business/actions";
import { createCampaign } from "@/features/campaigns/actions";

function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "").split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

function text(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

export async function saveBusinessAction(form: FormData) {
  saveBusinessProfile(db, {
    businessName: text(form, "businessName"), website: text(form, "website"),
    businessDescription: text(form, "businessDescription"), offer: text(form, "offer"), oneLinePitch: text(form, "oneLinePitch"),
    averageTicket: text(form, "averageTicket") ? Number(text(form, "averageTicket")) : null, salesGoal: text(form, "salesGoal"),
    verifiedClaims: lines(form.get("verifiedClaims")), forbiddenClaims: lines(form.get("forbiddenClaims")),
    targetIndustries: lines(form.get("targetIndustries")), targetBusinessTypes: lines(form.get("targetBusinessTypes")),
    targetLocations: lines(form.get("targetLocations")), targetCompanySize: text(form, "targetCompanySize"),
    targetKeywords: lines(form.get("targetKeywords")), positiveSignals: lines(form.get("positiveSignals")),
    negativeSignals: lines(form.get("negativeSignals")), exclusions: lines(form.get("exclusions")),
    outreachGoal: text(form, "outreachGoal"), callToAction: text(form, "callToAction"), tone: text(form, "tone"),
    outreachLanguage: text(form, "outreachLanguage") || "pt-BR", exampleMessages: lines(form.get("exampleMessages")),
    additionalInstructions: text(form, "additionalInstructions"),
    ownerName: text(form, "ownerName"), ownerRole: text(form, "ownerRole"), instagramHandle: text(form, "instagramHandle"),
    whatsappLink: text(form, "whatsappLink"), affiliateGroupLink: text(form, "affiliateGroupLink"), howItWorks: text(form, "howItWorks"),
    revenueModel: text(form, "revenueModel"), marketJargon: text(form, "marketJargon"), unverifiedClaims: lines(form.get("unverifiedClaims")),
    affiliateTopics: lines(form.get("affiliateTopics")), geography: text(form, "geography"),
  });
  revalidatePath("/");
  redirect("/campaigns/new");
}

export async function createCampaignAction(form: FormData) {
  const sources = form.getAll("sources").map(String) as Array<"csv" | "seed_urls" | "overpass" | "google_places" | "instagram">;
  const campaign = createCampaign(db, {
    name: text(form, "name"), description: text(form, "description"), targetLocations: lines(form.get("targetLocations")),
    industries: lines(form.get("industries")), keywords: lines(form.get("keywords")), requiredSignals: lines(form.get("requiredSignals")),
    preferredSignals: lines(form.get("preferredSignals")), excludedSignals: lines(form.get("excludedSignals")), sources,
    funnel: text(form, "funnel") === "affiliate" ? "affiliate" : "customer", autopilot: form.get("autopilot") === "1", hashtags: lines(form.get("hashtags")),
    targetLeadCount: Number(text(form, "targetLeadCount") || 20), minimumScore: Number(text(form, "minimumScore") || 70),
    outreachLanguage: text(form, "outreachLanguage") || "pt-BR",
  });
  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaign.id}`);
}
