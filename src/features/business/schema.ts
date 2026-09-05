import { z } from "zod";

const textList = z.array(z.string().trim().min(1)).default([]);

export const businessProfileSchema = z.object({
  businessName: z.string().trim().min(2),
  website: z.union([z.url(), z.literal(""), z.null()]).optional().transform((value) => value || null),
  businessDescription: z.string().trim().min(10),
  offer: z.string().trim().min(3),
  oneLinePitch: z.string().trim().min(5),
  averageTicket: z.number().nonnegative().nullable().optional(),
  salesGoal: z.string().trim().nullable().optional(),
  verifiedClaims: textList,
  forbiddenClaims: textList,
  targetIndustries: textList,
  targetBusinessTypes: textList,
  targetLocations: textList,
  targetCompanySize: z.string().trim().nullable().optional(),
  targetKeywords: textList,
  positiveSignals: textList,
  negativeSignals: textList,
  exclusions: textList,
  outreachGoal: z.string().trim().min(3),
  callToAction: z.string().trim().min(3),
  tone: z.string().trim().min(2),
  outreachLanguage: z.string().trim().min(2).default("pt-BR"),
  exampleMessages: textList,
  additionalInstructions: z.string().trim().nullable().optional(),
  // CONFIGURAÇÃO block of the original "Buscando 1 Milhão" prompt. All optional so a web-only setup still works.
  ownerName: z.string().trim().nullable().optional(),
  ownerRole: z.string().trim().nullable().optional(),
  instagramHandle: z.string().trim().nullable().optional().transform((value) => (value ? value.replace(/^@/, "").toLowerCase() : value)),
  whatsappLink: z.union([z.url(), z.literal(""), z.null()]).optional().transform((value) => value || null),
  affiliateGroupLink: z.union([z.url(), z.literal(""), z.null()]).optional().transform((value) => value || null),
  howItWorks: z.string().trim().nullable().optional(),
  revenueModel: z.string().trim().nullable().optional(),
  marketJargon: z.string().trim().nullable().optional(),
  unverifiedClaims: textList,
  affiliateTopics: textList,
  geography: z.string().trim().nullable().optional(),
});

export type BusinessProfileInput = z.input<typeof businessProfileSchema>;
export type BusinessProfile = z.output<typeof businessProfileSchema> & { id: string; createdAt: string; updatedAt: string };
