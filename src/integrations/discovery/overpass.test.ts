import { describe, expect, test } from "vitest";
import { buildOverpassQuery, createOverpassProvider } from "@/integrations/discovery/overpass";

describe("Overpass discovery", () => {
  test("builds a bounded query from campaign industries and location", () => {
    const query = buildOverpassQuery({ locations: ["Miami, Florida"], industries: ["dentist", "dental clinic"], limit: 25 });
    expect(query).toContain('["healthcare"="dentist"]');
    expect(query).toContain("out center 25;");
    expect(query).toContain('area["name"="Miami"]');
  });

  test("maps public OSM elements and caches identical requests", async () => {
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ elements: [{ type: "node", id: 10, tags: { name: "Ocean Dental", website: "https://ocean.example", email: "care@ocean.example", phone: "+1 305 555 0100", "addr:city": "Miami" } }] }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const provider = createOverpassProvider({ fetcher, endpoint: "https://overpass.example/api" });
    const input = { campaignId: "campaign-1", locations: ["Miami"], industries: ["dentist"], keywords: [], limit: 10 };
    const first = []; for await (const lead of provider.discover(input)) first.push(lead);
    const second = []; for await (const lead of provider.discover(input)) second.push(lead);

    expect(first[0]?.companyName).toBe("Ocean Dental");
    expect(first[0]?.sourceUrl).toBe("https://www.openstreetmap.org/node/10");
    expect(second).toEqual(first);
    expect(calls).toBe(1);
  });
});
