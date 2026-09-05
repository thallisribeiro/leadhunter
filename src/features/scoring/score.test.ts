import { describe, expect, test } from "vitest";
import { calculateLeadScore } from "@/features/scoring/score";

describe("deterministic lead scoring", () => {
  test("calculates an auditable 0-100 score across five sections", () => {
    const result = calculateLeadScore({ industryMatch: true, locationMatch: true, requiredKeywordMatch: true, opportunityDetected: true, hasEmail: true, hasPhone: true, hasSocial: true, positiveSignalCount: 2, exclusionDetected: false, hasWebsite: true, evidenceCount: 4, sourceCount: 2 });
    expect(result.score).toBe(90);
    expect(result.confidence).toBe(100);
    expect(result.breakdown.map((item) => item.section)).toEqual(["ICP Fit", "Opportunity", "Contactability", "Intent/Signals", "Data Quality"]);
  });

  test("applies exclusions and keeps confidence independent from fit", () => {
    const result = calculateLeadScore({ industryMatch: true, locationMatch: true, requiredKeywordMatch: true, opportunityDetected: true, hasEmail: false, hasPhone: false, hasSocial: false, positiveSignalCount: 2, exclusionDetected: true, hasWebsite: false, evidenceCount: 0, sourceCount: 1 });
    expect(result.score).toBe(35);
    expect(result.confidence).toBeLessThan(40);
  });
});
