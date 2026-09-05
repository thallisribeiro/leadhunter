import { createOverpassProvider } from "@/integrations/discovery/overpass";
import { createSeedUrlProvider } from "@/integrations/discovery/seed-urls";
import { createCrawler } from "@/integrations/web/crawler";

const input = {
  campaignId: "real-source-smoke",
  locations: ["Miami"],
  industries: ["dentist"],
  keywords: ["dental"],
  limit: 3,
  seedUrls: ["https://example.com"],
};

const overpassLeads = [];
for await (const lead of createOverpassProvider().discover(input)) {
  overpassLeads.push({ companyName: lead.companyName, sourceUrl: lead.sourceUrl });
  if (overpassLeads.length >= input.limit) break;
}
if (overpassLeads.length === 0) throw new Error("A fonte Overpass não retornou empresas no smoke test.");

const seedProvider = createSeedUrlProvider(input.seedUrls);
const seed = (await seedProvider.discover(input).next()).value;
if (!seed?.website) throw new Error("A fonte seed URL não produziu um website.");
const pages = await createCrawler({ maxPages: 1, timeoutMs: 12_000 }).crawl(seed.website);
if (pages.length !== 1) throw new Error("O enriquecimento da seed URL não carregou a página pública.");

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  overpass: { count: overpassLeads.length, leads: overpassLeads },
  seedUrl: { companyName: seed.companyName, finalUrl: pages[0]?.url, htmlBytes: Buffer.byteLength(pages[0]?.html ?? "", "utf8") },
}, null, 2));
