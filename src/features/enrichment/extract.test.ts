import { describe, expect, test } from "vitest";
import { extractBusinessData } from "@/features/enrichment/extract";

describe("business page extraction", () => {
  test("extracts public contacts, social links, description and evidence", () => {
    const data = extractBusinessData(`<html><head><title>Ocean Dental</title><meta name="description" content="Cosmetic dentistry in Miami"></head><body><h1>Implantes e estética dental</h1><a href="mailto:care@ocean.example">Email</a><a href="tel:+13055550100">Call</a><a href="https://instagram.com/oceandental">Instagram</a><a href="https://wa.me/13055550100">WhatsApp</a><a href="/contact">Contato</a></body></html>`, "https://ocean.example/");

    expect(data.companyName).toBe("Ocean Dental");
    expect(data.emails).toEqual(["care@ocean.example"]);
    expect(data.phones).toContain("+13055550100");
    expect(data.socials.instagram).toBe("https://instagram.com/oceandental");
    expect(data.socials.whatsapp).toBe("https://wa.me/13055550100");
    expect(data.internalLinks).toEqual(["https://ocean.example/contact"]);
    expect(data.signals).toContain("odontologia estética");
  });
});
