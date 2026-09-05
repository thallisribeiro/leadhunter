import { describe, expect, test } from "vitest";
import { normalizeLeadIdentity } from "@/features/discovery/dedupe";

describe("lead identity normalization", () => {
  test("normalizes domains, emails, phones, urls and name-location fallback", () => {
    expect(normalizeLeadIdentity({ companyName: " Clínica São José ", website: "HTTPS://WWW.Example.COM/about/", email: " Sales@Example.com ", phone: "+1 (305) 555-0101", city: "Miami", country: "USA" })).toEqual({
      normalizedName: "clinica sao jose",
      normalizedDomain: "example.com",
      normalizedEmail: "sales@example.com",
      normalizedPhone: "13055550101",
      canonicalUrl: "https://example.com/about",
      locationKey: "miami|usa",
    });
  });
});
