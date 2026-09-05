import { z } from "zod";

export const evidenceInterpretationSchema = z.object({
  whyThisLead: z.string().trim().min(3),
  opportunity: z.string().trim().min(3),
  personalizationHook: z.string().trim().min(3),
  evidenceIds: z.array(z.string()).min(1),
});

export type EvidenceInterpretation = z.infer<typeof evidenceInterpretationSchema>;
