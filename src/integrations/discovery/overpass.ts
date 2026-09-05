import type { DiscoveredLead, DiscoveryInput, LeadDiscoveryProvider } from "@/features/discovery/types";

interface OsmElement { type: "node" | "way" | "relation"; id: number; tags?: Record<string, string>; center?: { lat: number; lon: number } }
const cache = new Map<string, { expiresAt: number; leads: DiscoveredLead[] }>();

function escapeOverpass(value: string): string { return value.replace(/["\\]/g, ""); }

export function buildOverpassQuery(input: { locations: string[]; industries: string[]; limit: number }): string {
  const location = escapeOverpass(input.locations[0]?.split(",")[0]?.trim() || "");
  const selectors = input.industries.map((industry) => {
    const normalized = industry.toLowerCase();
    if (normalized.includes("dent")) return '["healthcare"="dentist"]';
    return `["name"~"${escapeOverpass(industry)}",i]`;
  });
  const unique = [...new Set(selectors)];
  return `[out:json][timeout:25];area["name"="${location}"]->.searchArea;(${unique.flatMap((selector) => ["node", "way", "relation"].map((kind) => `${kind}${selector}(area.searchArea);`)).join("")});out center ${Math.min(input.limit, 500)};`;
}

export function createOverpassProvider(options: { fetcher?: typeof fetch; endpoint?: string; cacheTtlMs?: number } = {}): LeadDiscoveryProvider {
  const fetcher = options.fetcher ?? fetch;
  const endpoint = options.endpoint ?? process.env.OVERPASS_API_URL ?? "https://overpass-api.de/api/interpreter";
  const cacheTtlMs = options.cacheTtlMs ?? 60 * 60 * 1_000;
  return { name: "overpass", async *discover(input: DiscoveryInput) {
    const query = buildOverpassQuery(input);
    const cacheKey = `${endpoint}:${query}`;
    const hit = cache.get(cacheKey);
    let discovered = hit && hit.expiresAt > Date.now() ? hit.leads : null;
    if (!discovered) {
      const response = await fetcher(endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "LeadHunterLocal/0.1" }, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Overpass returned ${response.status}`);
      const data = await response.json() as { elements?: OsmElement[] };
      discovered = (data.elements ?? []).flatMap((element) => {
        const tags = element.tags ?? {}; if (!tags.name) return [];
        return [{ companyName: tags.name, website: tags.website ?? tags["contact:website"], email: tags.email ?? tags["contact:email"], phone: tags.phone ?? tags["contact:phone"], city: tags["addr:city"], region: tags["addr:state"], country: tags["addr:country"], instagram: tags["contact:instagram"], sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`, externalId: `${element.type}/${element.id}`, raw: { tags } } satisfies DiscoveredLead];
      });
      cache.set(cacheKey, { expiresAt: Date.now() + cacheTtlMs, leads: discovered });
    }
    for (const lead of discovered) yield lead;
  } };
}
