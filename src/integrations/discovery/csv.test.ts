import { describe, expect, test } from "vitest";
import { parseLeadCsv } from "@/integrations/discovery/csv";

describe("CSV discovery", () => {
  test("maps standard aliases and quoted values", () => {
    const result = parseLeadCsv('Empresa,Site,E-mail,Cidade,País\n"Bright, Smile",https://bright.example,hello@bright.example,Miami,USA');
    expect(result).toEqual([{ companyName: "Bright, Smile", website: "https://bright.example", email: "hello@bright.example", city: "Miami", country: "USA", sourceUrl: "csv:2" }]);
  });

  test("accepts explicit mapping for unknown headers", () => {
    const result = parseLeadCsv("org,url\nNorth Dental,https://north.example", { org: "companyName", url: "website" });
    expect(result[0]?.companyName).toBe("North Dental");
  });
});
